//! 启动器（命令面板）：聚合内置动作、URL、本地路径、浏览器书签与本地文件搜索。

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
mod system_apps;

use files::FileOpenMode;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileKeyword {
    Find,
    Open,
}

/// 仅当 `find` / `open` 作为首词且后跟空白时，进入仅「文件」搜索，不再混合其它来源。
/// `find`：打开结果所在目录；`open`：打开文件；剩余串为文件名片段。
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
pub struct LauncherItem {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    /// `action` | `open_url` | `open_path`
    pub kind: String,
    pub payload: String,
}

/// 供前端 `invoke` 的查询：返回与关键词匹配的条目（含内置、书签、文件等）。
/// 在阻塞线程池执行，避免 `walkdir` 长时间占用主路径/拖慢界面。
#[tauri::command]
pub async fn launcher_query(
    state: State<'_, Mutex<AppConfig>>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    let config: AppConfig = lock_poisoned(&*state).clone();
    tokio::task::spawn_blocking(move || query_with_config(&config, query))
        .await
        .map_err(|e| e.to_string())
}

/// 不含慢速本地文件名 walk，用于与 `launcher_query` 组合，先出书签/系统/内置等再补全文件。
#[tauri::command]
pub async fn launcher_query_instant(
    state: State<'_, Mutex<AppConfig>>,
    query: String,
) -> Result<Vec<LauncherItem>, String> {
    let config: AppConfig = lock_poisoned(&*state).clone();
    tokio::task::spawn_blocking(move || query_with_config_impl(&config, query, false))
        .await
        .map_err(|e| e.to_string())
}

/// `include_file_search` 为 false 时略过本地文件名遍历，供「先快后全」的前半段结果。
fn query_with_config_impl(config: &AppConfig, query: String, include_file_search: bool) -> Vec<LauncherItem> {
    let q = query.trim();

    if let Some((kw, rest)) = try_parse_file_command(q) {
        let mode = match kw {
            FileKeyword::Find => FileOpenMode::OpenParentDirectory,
            FileKeyword::Open => FileOpenMode::OpenFile,
        };
        let mut out = files::file_items_for_query(
            config.launcher_file_search_enabled,
            &config.launcher_file_search_paths,
            &config.launcher_file_search_excluded_dir_names,
            &rest,
            mode,
        );
        if let FileKeyword::Open = kw {
            if !rest.is_empty() && path_exists(&rest) {
                out.insert(
                    0,
                    LauncherItem {
                        id: "open-direct".into(),
                        title: format!("打开 {rest}"),
                        subtitle: "本地路径".into(),
                        kind: "open_path".into(),
                        payload: rest,
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
    let file_hits = if include_file_search {
        files::file_items_for_query(
            config.launcher_file_search_enabled,
            &config.launcher_file_search_paths,
            &config.launcher_file_search_excluded_dir_names,
            q,
            FileOpenMode::OpenFile,
        )
    } else {
        vec![]
    };
    let system_hits = system_apps::items_for_query(&q, &q_lower);

    let mut out: Vec<LauncherItem> = Vec::new();
    out.extend(bms);
    out.extend(system_hits);
    out.extend(file_hits);
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
            },
        );
    }

    if path_exists(q) {
        out.insert(
            0,
            LauncherItem {
                id: "typed-path".into(),
                title: format!("打开 {q}"),
                subtitle: "本地路径".into(),
                kind: "open_path".into(),
                payload: q.to_string(),
            },
        );
    }

    out
}

fn query_with_config(config: &AppConfig, query: String) -> Vec<LauncherItem> {
    query_with_config_impl(config, query, true)
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
        },
        LauncherItem {
            id: "action-workspace".into(),
            title: "翻译工作台".into(),
            subtitle: "文本与 OCR 翻译".into(),
            kind: "action".into(),
            payload: "translate_workspace".into(),
        },
        LauncherItem {
            id: "action-clipboard".into(),
            title: "剪贴板历史".into(),
            subtitle: "打开剪贴板记录面板".into(),
            kind: "action".into(),
            payload: "clipboard".into(),
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
