//! 启动器（命令面板）：聚合内置动作、URL、本地路径、浏览器书签、已安装应用与按前缀的本地文件搜索。
//!
//! `find` / `open` 前缀行为对齐常见 Alfred 工作流：`find` → 在资源管理器/访达中**揭示**命中项的父文件夹；
//! `open` → **打开**命中文件（或 `.lnk` / `.app` 等，由系统默认方式处理）。

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::sync::{Arc, Mutex, OnceLock, RwLock};

use rayon::join;
use tokio::sync::oneshot;

use tauri::State;
use tauri::AppHandle;
use tauri::Runtime;
use tauri_plugin_opener::OpenerExt;

use crate::app_state::lock_poisoned;
use crate::config::AppConfig;
use crate::window;

mod bookmarks;
mod files;
mod fuzzy;
mod installed_apps;
mod recency;
mod system_apps;
#[cfg(target_os = "windows")]
pub(crate) mod uwp;

use files::FileOpenMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileKeyword {
    Find,
    Open,
}

/// 仅当 `find` / `open` 作为首词且后跟空白时，进入仅「文件」搜索，不再混合其它来源（与 Alfred 的 reveal / open 分工一致）。
/// `find`：揭示父文件夹；`open`：打开文件；剩余串为文件名匹配子串。
fn try_parse_file_command(q: &str) -> Option<(FileKeyword, String)> {
    let t = q.trim();
    let b = t.as_bytes();
    if b.len() < 4 {
        return None;
    }
    if b[..4].eq_ignore_ascii_case(b"find") {
        if b.len() == 4 {
            return Some((FileKeyword::Find, String::new()));
        }
        if b[4] == b' ' || b[4] == b'\t' {
            return Some((FileKeyword::Find, t[5..].trim().to_string()));
        }
        return None;
    }
    if b[..4].eq_ignore_ascii_case(b"open") {
        if b.len() == 4 {
            return Some((FileKeyword::Open, String::new()));
        }
        if b[4] == b' ' || b[4] == b'\t' {
            return Some((FileKeyword::Open, t[5..].trim().to_string()));
        }
        return None;
    }
    None
}

/// 单条可展示、可执行的启动器项。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherItem {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    /// `action` | `open_url` | `open_path` 等
    pub kind: String,
    pub payload: String,
    /// 若存在，前端可调用 `get_app_icon_data_url` 显示 .exe / .app 等系统图标
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_path: Option<String>,
}

/// 启动器内「可匹配行」的统一抽象：
/// 1) `match_text()`：预拼接的「标题 + 副标题 + alias」小写串，供 nucleo 打分；
/// 2) `frecency_key()`：返回 `(kind, payload)` 供 frecency 二级排序；
/// 3) `to_item()`：导出对应的 `LauncherItem` 副本。
pub(crate) trait MatchableRow {
    fn match_text(&self) -> &str;
    fn frecency_key(&self) -> (&str, &str);
    fn to_item(&self) -> LauncherItem;
}

/// 通用查询过滤：
/// - `q` 为空：返回全部项（保留静态顺序，不按 frecency 重排），避免用户第一眼看到的面板
///   「随机」徽乱。
/// - `q` 非空：用 [`fuzzy::compile_atom`] 编译查询，对每行 `match_text()` 评分，仅保留命中项；
///   按（匹配分 降，frecency 分 降）排序。
pub(crate) fn collect_matches<R: MatchableRow>(rows: &[R], q: &str, _q_lower: &str) -> Vec<LauncherItem> {
    if q.trim().is_empty() {
        return rows.iter().map(|r| r.to_item()).collect();
    }
    let Some(atom) = fuzzy::compile_atom(q) else {
        return Vec::new();
    };
    let snap = recency::snapshot();
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut scored: Vec<(u16, &R)> = rows
        .iter()
        .filter_map(|r| fuzzy::score(&atom, r.match_text()).map(|s| (s, r)))
        .collect();
    scored.sort_by(|(sa, ra), (sb, rb)| {
        sb.cmp(sa).then_with(|| {
            let (ka, pa) = ra.frecency_key();
            let (kb, pb) = rb.frecency_key();
            let fa = recency::score_or_zero(&snap, now_ms, ka, pa);
            let fb = recency::score_or_zero(&snap, now_ms, kb, pb);
            fb.partial_cmp(&fa).unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    scored.into_iter().map(|(_, r)| r.to_item()).collect()
}

/// 进程启动后调用一次：在后台线程预热已安装应用缓存（Win 端 walkdir 整个开始菜单），
/// 让用户首次按下启动器快捷键时就能命中缓存，免去秒级冷启延迟。
pub fn prewarm_in_background() {
    std::thread::Builder::new()
        .name("launcher-prewarm".into())
        .spawn(installed_apps::warmup)
        .ok();
}

struct LauncherQueryJob {
    seq: u64,
    config: AppConfig,
    query: String,
    reply: oneshot::Sender<Vec<LauncherItem>>,
}

/// 每次 `launcher_query` 递增；worker 执行中若发现已有更新序号则提前中止。
static LAUNCHER_QUERY_SEQ: AtomicU64 = AtomicU64::new(0);

static LAUNCHER_QUERY_TX: OnceLock<Sender<LauncherQueryJob>> = OnceLock::new();

fn launcher_query_stale(seq: u64) -> bool {
    LAUNCHER_QUERY_SEQ.load(Ordering::Relaxed) != seq
}

pub(crate) fn launcher_query_aborted(seq: u64) -> bool {
    launcher_query_stale(seq)
}

fn launcher_query_tx() -> &'static Sender<LauncherQueryJob> {
    LAUNCHER_QUERY_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<LauncherQueryJob>();
        std::thread::Builder::new()
            .name("launcher-query".into())
            .spawn(move || launcher_query_worker(rx))
            .expect("launcher query worker thread");
        tx
    })
}

/// 单线程串行执行启动器查询；队列中积压的多条请求合并为「只跑最后一条」，
/// 被跳过的请求立即回空结果（前端按 generation / query 字符串丢弃过期响应）。
fn launcher_query_worker(rx: Receiver<LauncherQueryJob>) {
    while let Ok(mut job) = rx.recv() {
        loop {
            match rx.try_recv() {
                Ok(next) => {
                    let _ = job.reply.send(Vec::new());
                    job = next;
                }
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    let _ = job.reply.send(Vec::new());
                    return;
                }
            }
        }
        let result = query_with_config_impl(&job.config, job.query, job.seq);
        let out = if launcher_query_stale(job.seq) {
            Vec::new()
        } else {
            result
        };
        let _ = job.reply.send(out);
    }
}

/// 供前端 `invoke` 的启动器查询（内置、书签、已安装应用、系统项等）。
/// 本地文件名遍历仅在输入以 `find ` / `open ` 开头时执行（见 `try_parse_file_command`）。
/// 投递到专用 worker 线程，避免连续按键时多路查询并行扫盘/评分把 CPU 打满。
#[tauri::command]
pub async fn launcher_query(
    state: State<'_, Mutex<AppConfig>>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    let config: AppConfig = lock_poisoned(&*state).clone();
    let seq = LAUNCHER_QUERY_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    let (reply_tx, reply_rx) = oneshot::channel();
    launcher_query_tx()
        .send(LauncherQueryJob {
            seq,
            config,
            query,
            reply: reply_tx,
        })
        .map_err(|e| e.to_string())?;
    reply_rx.await.map_err(|e| e.to_string())
}

fn query_with_config_impl(config: &AppConfig, query: String, seq: u64) -> Vec<LauncherItem> {
    let q = query.trim();

    if launcher_query_stale(seq) {
        return Vec::new();
    }

    if let Some((kw, rest)) = try_parse_file_command(q) {
        let mode = match kw {
            FileKeyword::Find => FileOpenMode::OpenParentDirectory,
            FileKeyword::Open => FileOpenMode::OpenFile,
        };
        let file_roots = merged_launcher_file_search_paths(config);
        let mut out = files::file_items_for_query(
            config.launcher_file_search_enabled,
            &file_roots,
            &config.launcher_file_search_excluded_dir_names,
            &rest,
            mode,
        );
        if let FileKeyword::Open = kw {
            if !rest.is_empty() && path_exists(&rest) {
                let icon_path = files::icon_path_for_path(Path::new(&rest));
                out.insert(
                    0,
                    LauncherItem {
                        id: "open-direct".into(),
                        title: format!("打开 {rest}"),
                        subtitle: "本地路径".into(),
                        kind: "open_path".into(),
                        payload: rest,
                        icon_path,
                    },
                );
            }
        }
        return out;
    }

    let q_lower = q.to_lowercase();
    let builtins_matched = collect_matches(builtins_table(), q, &q_lower);

    if q.is_empty() {
        let mut out = builtins_matched;
        out.extend(system_apps::items_for_query("", ""));
        return out;
    }

    if launcher_query_stale(seq) {
        return Vec::new();
    }

    let chrome = config.launcher_bookmarks_chrome;
    let edge = config.launcher_bookmarks_edge;
    let brave = config.launcher_bookmarks_brave;
    let ((bms, system_hits), installed_hits) = join(
        || {
            join(
                || bookmarks::bookmark_items_for_query(q, chrome, edge, brave),
                || system_apps::items_for_query(q, &q_lower),
            )
        },
        || installed_apps::items_for_query(q, &q_lower, seq),
    );

    if launcher_query_stale(seq) {
        return Vec::new();
    }

    let mut out: Vec<LauncherItem> = Vec::new();
    out.extend(bms);
    out.extend(system_hits);
    out.extend(installed_hits);
    out.extend(builtins_matched);

    if is_probable_url(q) {
        out.insert(
            0,
            LauncherItem {
                id: "typed-url".into(),
                title: format!("在浏览器中打开 {q}"),
                subtitle: "URL".into(),
                kind: "open_url".into(),
                payload: normalize_url(q).unwrap_or_else(|| q.to_string()),
                icon_path: None,
            },
        );
    }

    if query_looks_like_filesystem_path(q) && path_exists(q) {
        let p = Path::new(q);
        out.insert(
            0,
            LauncherItem {
                id: "typed-path".into(),
                title: format!("打开 {q}"),
                subtitle: "本地路径".into(),
                kind: "open_path".into(),
                payload: q.to_string(),
                icon_path: files::icon_path_for_path(p),
            },
        );
    }

    out
}

struct MergedFileRootsCache {
    fp: u64,
    paths: Arc<Vec<String>>,
}

static MERGED_FILE_ROOTS: RwLock<Option<MergedFileRootsCache>> = RwLock::new(None);

fn launcher_file_roots_fingerprint(config: &AppConfig) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for s in &config.launcher_file_search_paths {
        s.hash(&mut h);
    }
    h.finish()
}

/// 用户配置的搜索目录 + 平台默认「应用/快捷方式」目录（仅用于 `find`/`open` 文件遍历）。
/// 按配置路径指纹缓存；返回 `Arc<Vec<String>>` 避免按键路径上的 Vec deep clone。
fn merged_launcher_file_search_paths(config: &AppConfig) -> Arc<Vec<String>> {
    let fp = launcher_file_roots_fingerprint(config);
    if let Ok(g) = MERGED_FILE_ROOTS.read() {
        if let Some(c) = g.as_ref() {
            if c.fp == fp {
                return Arc::clone(&c.paths);
            }
        }
    }
    let paths = Arc::new(compute_merged_file_search_paths(config));
    if let Ok(mut g) = MERGED_FILE_ROOTS.write() {
        if let Some(c) = g.as_ref() {
            if c.fp == fp {
                return Arc::clone(&c.paths);
            }
        }
        *g = Some(MergedFileRootsCache {
            fp,
            paths: Arc::clone(&paths),
        });
    }
    paths
}

fn compute_merged_file_search_paths(config: &AppConfig) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for s in &config.launcher_file_search_paths {
        let t = s.trim();
        if t.is_empty() {
            continue;
        }
        let key = t.to_lowercase();
        if seen.insert(key) {
            out.push(t.to_string());
        }
    }
    for p in installed_apps::default_find_open_root_strings() {
        let key = p.to_lowercase();
        if seen.insert(key) {
            out.push(p);
        }
    }
    out
}

struct BuiltinRow {
    item: LauncherItem,
    /// 预拼接的小写匹配文本（标题 + 副标题），供 nucleo 评分。
    match_text: String,
}

impl MatchableRow for BuiltinRow {
    fn match_text(&self) -> &str {
        &self.match_text
    }
    fn frecency_key(&self) -> (&str, &str) {
        (&self.item.kind, &self.item.payload)
    }
    fn to_item(&self) -> LauncherItem {
        self.item.clone()
    }
}

fn make_builtin(item: LauncherItem) -> BuiltinRow {
    let match_text = format!("{} {}", item.title.to_lowercase(), item.subtitle.to_lowercase());
    BuiltinRow { item, match_text }
}

fn builtins_table() -> &'static [BuiltinRow] {
    static ROWS: OnceLock<Vec<BuiltinRow>> = OnceLock::new();
    ROWS.get_or_init(|| {
        vec![
            make_builtin(LauncherItem {
                id: "action-settings".into(),
                title: "打开设置".into(),
                subtitle: "Kitty Tools 偏好与快捷键".into(),
                kind: "action".into(),
                payload: "settings".into(),
                icon_path: None,
            }),
            make_builtin(LauncherItem {
                id: "action-workspace".into(),
                title: "翻译工作台".into(),
                subtitle: "文本与 OCR 翻译".into(),
                kind: "action".into(),
                payload: "translate_workspace".into(),
                icon_path: None,
            }),
            make_builtin(LauncherItem {
                id: "action-clipboard".into(),
                title: "剪贴板历史".into(),
                subtitle: "打开剪贴板记录面板".into(),
                kind: "action".into(),
                payload: "clipboard".into(),
                icon_path: None,
            }),
        ]
    })
    .as_slice()
}

fn path_exists(s: &str) -> bool {
    let p = Path::new(s);
    p.exists() && (p.is_file() || p.is_dir())
}

/// 避免对纯关键词（如中文应用名）每次 `exists()` 打盘；仅对像路径的输入检测。
fn query_looks_like_filesystem_path(q: &str) -> bool {
    let t = q.trim();
    if t.is_empty() {
        return false;
    }
    if t.starts_with('~') || t.starts_with("./") || t.starts_with("../") {
        return true;
    }
    #[cfg(unix)]
    if t.starts_with('/') {
        return true;
    }
    #[cfg(windows)]
    {
        let b = t.as_bytes();
        if t.starts_with(r"\\") {
            return true;
        }
        if b.len() >= 2 && b[1] == b':' {
            return true;
        }
    }
    t.contains('/') || t.contains('\\')
}

/// 仅做字符串特征匹配，不在按键路径上做磁盘探测；
/// 真正像路径的输入由 [`query_looks_like_filesystem_path`] 单独识别（互不干扰）。
fn is_probable_url(s: &str) -> bool {
    let t = s.trim();
    if t.starts_with("https://") || t.starts_with("http://") || t.starts_with("mailto:") {
        return true;
    }
    // 简单 TLD/前缀启发：长度 ≥ 4、含 `.`、不含空白；排除明显路径前缀避免误识。
    if t.len() < 4 || t.contains(char::is_whitespace) || !t.contains('.') {
        return false;
    }
    if t.starts_with('/') || t.starts_with('~') || t.starts_with("./") || t.starts_with("../") {
        return false;
    }
    #[cfg(windows)]
    {
        let b = t.as_bytes();
        if t.starts_with(r"\\") || (b.len() >= 2 && b[1] == b':') {
            return false;
        }
    }
    t.starts_with("www.")
        || t.ends_with(".com")
        || t.ends_with(".cn")
        || t.ends_with(".net")
        || t.ends_with(".org")
}

/// 补全协议前缀，避免 Windows 将 `baidu.com` 等裸域名当作本地文件名打开。
fn normalize_url(s: &str) -> Option<String> {
    let t = s.trim();
    if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("mailto:") {
        return Some(t.to_string());
    }
    if is_probable_url(t) {
        return Some(format!("https://{t}"));
    }
    None
}

/// 执行启动器项：先隐藏启动器窗口，再打开设置/工作区/剪贴板或系统打开器。
#[tauri::command]
pub async fn launcher_execute<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    payload: String,
) -> Result<(), String> {
    window::hide_launcher(&app);
    match kind.as_str() {
        "action" => match payload.as_str() {
            "settings" => {
                window::present_settings_window(&app).map_err(|e| e.to_string())?;
            }
            "translate_workspace" => {
                window::show_translate_workspace(&app).map_err(|e| e.to_string())?;
            }
            "clipboard" => {
                window::show_clipboard_popup(&app);
            }
            _ => return Err("未知动作".into()),
        },
        "open_url" => {
            let url = normalize_url(&payload)
                .unwrap_or_else(|| payload.clone());
            app.opener()
                .open_url(&url, None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        "open_path" => {
            #[cfg(target_os = "windows")]
            {
                if payload == "explorer" {
                    use std::process::Command;
                    Command::new("explorer")
                        .spawn()
                        .map_err(|e| format!("无法启动资源管理器: {e}"))?;
                    // 资源管理器走专用启动路径但仍计入 frecency。
                    recency::record(&kind, &payload);
                    return Ok(());
                }
            }
            app.opener()
                .open_path(&payload, None::<&str>)
                .map_err(|e| e.to_string())?;
        }
        "win_shell" => {
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                use std::os::windows::process::CommandExt;
                // `start "" <payload>` 以关联方式启动 UWP、.msc、calc 等
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                let st = Command::new("cmd")
                    .args(["/C", "start", "", &payload])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn();
                st.map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "windows"))]
            {
                return Err("当前平台不支持此启动项".into());
            }
        }
        "mac_open" => {
            #[cfg(target_os = "macos")]
            {
                use std::process::Command;
                Command::new("open")
                    .args(["-a", &payload])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            #[cfg(not(target_os = "macos"))]
            {
                return Err("当前平台不支持此启动项".into());
            }
        }
        _ => return Err("未知类型".into()),
    }
    // 成功执行后统一记录 frecency；下次相似查询排在更前。
    recency::record(&kind, &payload);
    Ok(())
}

#[cfg(test)]
mod url_tests {
    use super::{is_probable_url, normalize_url};

    #[test]
    fn normalize_bare_domain_gets_https() {
        assert_eq!(normalize_url("baidu.com").as_deref(), Some("https://baidu.com"));
    }

    #[test]
    fn normalize_www_domain_gets_https() {
        assert_eq!(
            normalize_url("www.example.com").as_deref(),
            Some("https://www.example.com")
        );
    }

    #[test]
    fn normalize_keeps_existing_scheme() {
        assert_eq!(
            normalize_url("https://github.com").as_deref(),
            Some("https://github.com")
        );
    }

    #[test]
    fn probable_url_excludes_windows_paths() {
        assert!(!is_probable_url(r"C:\foo.com"));
    }
}
