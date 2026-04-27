//! 启动器（命令面板）：聚合内置动作、URL、本地路径、浏览器书签、已安装应用与按前缀的本地文件搜索。
//!
//! `find` / `open` 前缀行为对齐常见 Alfred 工作流：`find` → 在资源管理器/访达中**揭示**命中项的父文件夹；
//! `open` → **打开**命中文件（或 `.lnk` / `.app` 等，由系统默认方式处理）。

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use tauri::State;
use tauri::AppHandle;
use tauri::Runtime;
use tauri_plugin_opener::OpenerExt;

use crate::app_state::lock_poisoned;
use crate::config::AppConfig;
use crate::window;

mod bookmarks;
mod files;
mod installed_apps;
mod system_apps;

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

/// 供前端 `invoke` 的查询：返回与关键词匹配的条目（内置、书签、应用等）。
/// 本地文件名遍历仅在输入以 `find ` / `open ` 开头时执行（见 `try_parse_file_command`）。
/// 在阻塞线程池执行，避免 `walkdir` 长时间占用线程池/拖慢界面。
#[tauri::command]
pub async fn launcher_query(
    state: State<'_, Mutex<AppConfig>>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    let config: AppConfig = lock_poisoned(&*state).clone();
    tokio::task::spawn_blocking(move || query_with_config_impl(&config, query))
        .await
        .map_err(|e| e.to_string())
}

/// 与 `launcher_query` 共用同一实现；保留独立命令名以便前端对「普通关键词」只调本接口，对 `find`/`open` 调 `launcher_query`。
#[tauri::command]
pub async fn launcher_query_instant(
    state: State<'_, Mutex<AppConfig>>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    let config: AppConfig = lock_poisoned(&*state).clone();
    tokio::task::spawn_blocking(move || query_with_config_impl(&config, query))
        .await
        .map_err(|e| e.to_string())
}

fn query_with_config_impl(config: &AppConfig, query: String) -> Vec<LauncherItem> {
    let q = query.trim();

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
    let mut builtins_matched: Vec<LauncherItem> = Vec::new();

    for item in built_in_list() {
        if q.is_empty() {
            builtins_matched.push(item);
            continue;
        }
        let title = item.title.to_lowercase();
        let sub = item.subtitle.to_lowercase();
        if title.contains(&q_lower) || sub.contains(&q_lower) {
            builtins_matched.push(item);
        }
    }

    if q.is_empty() {
        let mut out = builtins_matched;
        out.extend(system_apps::items_for_query("", ""));
        return out;
    }

    let bms = bookmarks::bookmark_items_for_query(
        q,
        config.launcher_bookmarks_chrome,
        config.launcher_bookmarks_edge,
        config.launcher_bookmarks_brave,
    );
    let system_hits = system_apps::items_for_query(&q, &q_lower);
    let installed_hits = installed_apps::items_for_query(&q, &q_lower);

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

    if path_exists(q) {
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

/// 用户配置的搜索目录 + 平台默认「应用/快捷方式」目录（仅用于 `find`/`open` 文件遍历，避免与普通关键词混合扫盘）。
fn merged_launcher_file_search_paths(config: &AppConfig) -> Vec<String> {
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

fn path_exists(s: &str) -> bool {
    let p = Path::new(s);
    p.exists() && (p.is_file() || p.is_dir())
}

fn is_probable_url(s: &str) -> bool {
    let t = s.trim();
    t.starts_with("https://")
        || t.starts_with("http://")
        || t.starts_with("mailto:")
        || (t.contains('.') && !t.contains(' ') && t.len() > 3 && !Path::new(t).exists())
            && (t.starts_with("www.")
                || t.ends_with(".com")
                || t.ends_with(".cn")
                || t.ends_with(".net")
                || t.ends_with(".org"))
}

fn normalize_url(s: &str) -> Option<String> {
    let t = s.trim();
    if t.starts_with("http://") || t.starts_with("https://") || t.starts_with("mailto:") {
        return Some(t.to_string());
    }
    if t.starts_with("www.") {
        return Some(format!("https://{t}"));
    }
    None
}

fn built_in_list() -> Vec<LauncherItem> {
    vec![
        LauncherItem {
            id: "action-settings".into(),
            title: "打开设置".into(),
            subtitle: "Kitty Tools 偏好与快捷键".into(),
            kind: "action".into(),
            payload: "settings".into(),
            icon_path: None,
        },
        LauncherItem {
            id: "action-workspace".into(),
            title: "翻译工作台".into(),
            subtitle: "文本与 OCR 翻译".into(),
            kind: "action".into(),
            payload: "translate_workspace".into(),
            icon_path: None,
        },
        LauncherItem {
            id: "action-clipboard".into(),
            title: "剪贴板历史".into(),
            subtitle: "打开剪贴板记录面板".into(),
            kind: "action".into(),
            payload: "clipboard".into(),
            icon_path: None,
        },
    ]
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
                window::hide_floating_window(&app);
                window::hide_clipboard_popup(&app);
                window::show_settings_window(&app).map_err(|e| e.to_string())?;
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
            app.opener()
                .open_url(&payload, None::<&str>)
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
    Ok(())
}
