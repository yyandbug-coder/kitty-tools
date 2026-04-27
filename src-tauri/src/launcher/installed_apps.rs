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
    /// 用于排序：标题前缀匹配优先于仅子串匹配。
    title_lower: String,
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
/// **标题前缀匹配**优先，其次子串匹配；组内按标题长度升序。两遍收集避免对超大量命中做一次大排序。
pub fn items_for_query(q: &str, q_lower: &str) -> Vec<LauncherItem> {
    if q.trim().is_empty() || q_lower.is_empty() {
        return Vec::new();
    }
    let entries = scan_or_cached();
    let mut prefix_idx: Vec<usize> = Vec::new();
    let mut rest_idx: Vec<usize> = Vec::new();
    for (i, e) in entries.iter().enumerate() {
        if !e.search_lower.contains(q_lower) {
            continue;
        }
        if e.title_lower.starts_with(q_lower) {
            prefix_idx.push(i);
        } else {
            rest_idx.push(i);
        }
    }
    prefix_idx.sort_by_key(|&i| entries[i].item.title.len());
    rest_idx.sort_by_key(|&i| entries[i].item.title.len());

    let mut out = Vec::with_capacity(MAX_MATCH.min(prefix_idx.len() + rest_idx.len()));
    for i in prefix_idx {
        if out.len() >= MAX_MATCH {
            break;
        }
        out.push(entries[i].item.clone());
    }
    for i in rest_idx {
        if out.len() >= MAX_MATCH {
            break;
        }
        out.push(entries[i].item.clone());
    }
    out
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
                title_lower,
            });
        }
    }
    out
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
        let Ok(rd) = std::fs::read_dir(&base) else {
            continue;
        };
        for e in rd.flatten() {
            if out.len() >= MAX_INSTALLED {
                return out;
            }
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            let Some(ext) = p.extension().and_then(|e| e.to_str()) else {
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
                title_lower,
            });
        }
    }
    out
}
