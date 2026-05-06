//! 已安装应用扫描：Windows 开始菜单 `.lnk`、macOS `*.app`（`.app` 为目录）。
//! 供默认启动器搜索使用（无需 `find`/`open` 前缀）；结果带短期缓存，避免每次按键全量遍历。

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use walkdir::WalkDir;

use super::files;
use super::LauncherItem;

const CACHE_TTL: Duration = Duration::from_secs(300);
/// 首次扫描与缓存体量上限，避免异常目录拖垮内存。
const MAX_INSTALLED: usize = 4000;
/// 单次查询最多返回的已安装应用条数（书签等仍独立展示）。
const MAX_MATCH: usize = 80;

struct CachedEntry {
    item: LauncherItem,
    /// 扫描时预计算，避免每次按键对数千条重复 `to_lowercase`。
    search_lower: String,
}

struct Cache {
    built_at: Instant,
    entries: Arc<Vec<CachedEntry>>,
}

static CACHE: RwLock<Option<Cache>> = RwLock::new(None);
/// 缓存失效时只允许一条线程全量扫描，避免多路 `launcher_query` 同时扫开始菜单。
static REFRESH_LOCK: Mutex<()> = Mutex::new(());

fn stable_id(path: &str) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    format!("installed-{:x}", h.finish())
}

fn cache_stale(c: &Cache, now: Instant) -> bool {
    now.duration_since(c.built_at) > CACHE_TTL
}

/// 进程启动后调用一次：让首次查询不必等开始菜单 walkdir。结果直接喂入 `CACHE`，
/// 内部已用 `REFRESH_LOCK` 保证只有一条线程做扫描。
pub(super) fn warmup() {
    let _ = scan_or_cached();
}

/// 扫描在锁外执行，避免长时间占用全局锁阻塞其它启动器查询。
fn scan_or_cached() -> Arc<Vec<CachedEntry>> {
    let now = Instant::now();
    {
        let g = CACHE.read().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = g.as_ref() {
            if !cache_stale(c, now) {
                return Arc::clone(&c.entries);
            }
        }
    }

    let _only_one_scanner = REFRESH_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    let now = Instant::now();
    {
        let g = CACHE.read().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = g.as_ref() {
            if !cache_stale(c, now) {
                return Arc::clone(&c.entries);
            }
        }
    }

    let fresh = Arc::new(scan_all_installed_entries());

    let mut g = CACHE.write().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(c) = g.as_ref() {
        if !cache_stale(c, now) {
            return Arc::clone(&c.entries);
        }
    }
    *g = Some(Cache {
        built_at: now,
        entries: Arc::clone(&fresh),
    });
    fresh
}

/// 有关键词时返回名称/路径匹配的已安装应用；空查询不展开（由内置「系统应用」短列表兜底）。
/// 用 nucleo 模糊评分（自带前缀/词首加权 — 比手写「prefix 桶」更细腻），再用 frecency
/// 与标题长度做二级 / 三级 tie-break。
pub fn items_for_query(q: &str, q_lower: &str) -> Vec<LauncherItem> {
    if q.trim().is_empty() || q_lower.is_empty() {
        return Vec::new();
    }
    let Some(atom) = super::fuzzy::compile_atom(q) else {
        return Vec::new();
    };
    let entries = scan_or_cached();

    let mut scored: Vec<(u16, usize)> = entries
        .iter()
        .enumerate()
        .filter_map(|(i, e)| super::fuzzy::score(&atom, &e.search_lower).map(|s| (s, i)))
        .collect();

    let frecency = super::recency::snapshot();
    let now_ms = chrono::Utc::now().timestamp_millis();
    let cmp = |(sa, ia): &(u16, usize), (sb, ib): &(u16, usize)| {
        sb.cmp(sa).then_with(|| {
            let ea = &entries[*ia];
            let eb = &entries[*ib];
            let fa = super::recency::score_or_zero(&frecency, now_ms, &ea.item.kind, &ea.item.payload);
            let fb = super::recency::score_or_zero(&frecency, now_ms, &eb.item.kind, &eb.item.payload);
            fb.partial_cmp(&fa)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| ea.item.title.len().cmp(&eb.item.title.len()))
        })
    };

    // Top-k：当命中数远大于 `MAX_MATCH` 时（极少数热门关键词如 `e`、`a` 会在 4000 条 lnk 上命中数百）
    // 用 `select_nth_unstable_by` 在 O(N) 切出前 k 个，再仅对这 k 个全排，避免对 N 全排序的 O(N log N) 开销。
    if scored.len() > MAX_MATCH {
        let (left, _pivot, _right) = scored.select_nth_unstable_by(MAX_MATCH, cmp);
        // 截取前 MAX_MATCH 项后做完整排序（k=80 排序 ~5µs）
        let mut top: Vec<(u16, usize)> = left.to_vec();
        top.sort_by(cmp);
        return top.into_iter().map(|(_, i)| entries[i].item.clone()).collect();
    }
    scored.sort_by(cmp);
    scored
        .into_iter()
        .take(MAX_MATCH)
        .map(|(_, i)| entries[i].item.clone())
        .collect()
}

/// `find` / `open` 文件搜索时合并进用户配置目录，便于搜到开始菜单快捷方式与 macOS 应用包（类似 Alfred 常用范围）。
pub(super) fn default_find_open_root_strings() -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        windows_start_menu_roots()
            .into_iter()
            .map(|p| p.to_string_lossy().into_owned())
            .collect()
    }
    #[cfg(target_os = "macos")]
    {
        let mut v = vec!["/Applications".to_string()];
        if let Some(h) = dirs::home_dir() {
            v.push(h.join("Applications").to_string_lossy().into_owned());
        }
        v
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn windows_start_menu_roots() -> Vec<std::path::PathBuf> {
    let mut v = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        v.push(
            std::path::PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Ok(pd) = std::env::var("PROGRAMDATA") {
        v.push(
            std::path::PathBuf::from(pd)
                .join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs"),
        );
    }
    if let Ok(la) = std::env::var("LOCALAPPDATA") {
        v.push(std::path::PathBuf::from(la).join("Programs"));
    }
    v
}

fn scan_all_installed_entries() -> Vec<CachedEntry> {
    #[cfg(target_os = "windows")]
    {
        scan_windows_lnk()
    }
    #[cfg(target_os = "macos")]
    {
        scan_macos_apps()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn scan_windows_lnk() -> Vec<CachedEntry> {
    let mut seen_payload = HashSet::<String>::new();
    let mut seen_title_lower = HashSet::<String>::new();
    let mut out = Vec::new();
    for root in windows_start_menu_roots() {
        if !root.is_dir() {
            continue;
        }
        for entry in WalkDir::new(&root)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if out.len() >= MAX_INSTALLED {
                return out;
            }
            if !entry.file_type().is_file() {
                continue;
            }
            let p = entry.path();
            let Some(ext) = p.extension().and_then(|e| e.to_str()) else {
                continue;
            };
            if !ext.eq_ignore_ascii_case("lnk") {
                continue;
            }
            let Some(name) = p.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if name.trim().is_empty() {
                continue;
            }
            let payload = p.to_string_lossy().into_owned();
            if !seen_payload.insert(payload.clone()) {
                continue;
            }
            let title = name.to_string();
            let title_lower = title.to_lowercase();
            seen_title_lower.insert(title_lower.clone());
            let subtitle: String = "已安装应用 · 开始菜单".into();
            // 副标题无拉丁大写，直接拼接避免每行 `to_lowercase`。
            let search_lower = format!(
                "{} {} {}",
                &title_lower,
                subtitle,
                payload.to_lowercase()
            );
            let icon_path = files::icon_path_for_path(p);
            out.push(CachedEntry {
                item: LauncherItem {
                    id: stable_id(&payload),
                    title,
                    subtitle,
                    kind: "open_path".into(),
                    payload,
                    icon_path,
                },
                search_lower,
            });
        }
    }
    // Win32 .lnk 扫描完成后追加 UWP / MSIX 条目（Win11 内置工具基本都在这里）。
    // 同名（如「计算器」）的 .lnk 已存在时跳过 UWP 项，避免列表里出现重复。
    append_windows_uwp_entries(&mut out, &mut seen_payload, &seen_title_lower);
    out
}

#[cfg(target_os = "windows")]
fn append_windows_uwp_entries(
    out: &mut Vec<CachedEntry>,
    seen_payload: &mut HashSet<String>,
    seen_title_lower: &HashSet<String>,
) {
    for entry in super::uwp::enumerate_uwp_apps() {
        if out.len() >= MAX_INSTALLED {
            return;
        }
        let title_lower = entry.name.to_lowercase();
        if seen_title_lower.contains(&title_lower) {
            // 同名 Win32 .lnk 已存在；让带真实路径 / 图标的 .lnk 项胜出。
            continue;
        }
        let payload = super::uwp::shell_apps_folder_uri(&entry.app_id);
        if !seen_payload.insert(payload.clone()) {
            continue;
        }
        let subtitle: String = "已安装应用 · Microsoft Store".into();
        let search_lower = format!("{} {} {}", &title_lower, subtitle, entry.app_id.to_lowercase());
        // icon_path 直接复用 payload；resolve_icon_data_url 会识别 `shell:AppsFolder\\` 走 COM 拉图标。
        let icon_path = Some(payload.clone());
        out.push(CachedEntry {
            item: LauncherItem {
                id: stable_id(&payload),
                title: entry.name,
                subtitle,
                kind: "win_shell".into(),
                payload,
                icon_path,
            },
            search_lower,
        });
    }
}

#[cfg(target_os = "macos")]
fn scan_macos_apps() -> Vec<CachedEntry> {
    let mut seen_payload = HashSet::<String>::new();
    let mut out = Vec::new();
    let mut bases: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from("/Applications")];
    if let Some(h) = dirs::home_dir() {
        bases.push(h.join("Applications"));
    }
    for base in bases {
        if !base.is_dir() {
            continue;
        }
        // 第一层：base 下直接的 *.app；
        // 第二层：base 下普通子目录（如 `Utilities`）内的 *.app（覆盖系统自带 Terminal / Disk Utility 等）。
        // 不再向下深入，避免进入 `.app` bundle 的 `Contents/MacOS/*.app` 噪声项。
        if push_macos_app_dir(&base, &mut seen_payload, &mut out) {
            return out;
        }
        let Ok(rd) = std::fs::read_dir(&base) else {
            continue;
        };
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            // base 下若已是 `.app`，上一步 `push_macos_app_dir` 已处理过；跳过避免重复扫描其内部。
            let is_app_bundle = p.extension().and_then(|x| x.to_str()) == Some("app");
            if is_app_bundle {
                continue;
            }
            if push_macos_app_dir(&p, &mut seen_payload, &mut out) {
                return out;
            }
        }
    }
    out
}

/// 把 `dir` 下的 `*.app` 入条目；返回 `true` 表示已达到 `MAX_INSTALLED`，外层应停止扫描。
#[cfg(target_os = "macos")]
fn push_macos_app_dir(
    dir: &std::path::Path,
    seen_payload: &mut HashSet<String>,
    out: &mut Vec<CachedEntry>,
) -> bool {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return false;
    };
    for e in rd.flatten() {
        if out.len() >= MAX_INSTALLED {
            return true;
        }
        let p = e.path();
        if !p.is_dir() {
            continue;
        }
        let Some(ext) = p.extension().and_then(|x| x.to_str()) else {
            continue;
        };
        if ext != "app" {
            continue;
        }
        let title = p
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("App")
            .to_string();
        let title_lower = title.to_lowercase();
        let payload = p.to_string_lossy().into_owned();
        if !seen_payload.insert(payload.clone()) {
            continue;
        }
        let subtitle: String = "应用程序".into();
        let search_lower = format!(
            "{} {} {}",
            &title_lower,
            subtitle,
            payload.to_lowercase()
        );
        let icon_path = files::icon_path_for_path(&p);
        out.push(CachedEntry {
            item: LauncherItem {
                id: stable_id(&payload),
                title,
                subtitle,
                kind: "open_path".into(),
                payload,
                icon_path,
            },
            search_lower,
        });
    }
    false
}
