//! 启动器（命令面板）：聚合内置动作、URL、本地路径，后续可扩展文件索引与书签等。

use std::path::Path;
use tauri::AppHandle;
use tauri::Runtime;
use tauri_plugin_opener::OpenerExt;

use crate::window;

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

/// 供前端 `invoke` 的查询：返回与关键词匹配的条目（含系统内置快捷项）。
#[tauri::command]
pub fn launcher_query(query: String) -> Vec<LauncherItem> {
    let q = query.trim();
    let q_lower = q.to_lowercase();
    let mut out: Vec<LauncherItem> = Vec::new();

    for item in built_in_list() {
        if q.is_empty() {
            out.push(item);
            continue;
        }
        let title = item.title.to_lowercase();
        let sub = item.subtitle.to_lowercase();
        if title.contains(&q_lower) || sub.contains(&q_lower) {
            out.push(item);
        }
    }

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

    if !q.is_empty() && path_exists(q) {
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
    let mut v = vec![
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
    ];
    v.extend(platform_quick_actions());
    v
}

/// 每平台放少量可立即打开的常用入口；后续可替换为开始菜单/Spotlight 索引结果。
fn platform_quick_actions() -> Vec<LauncherItem> {
    #[cfg(target_os = "windows")]
    {
        vec![
            LauncherItem {
                id: "os-explorer".into(),
                title: "文件资源管理器".into(),
                subtitle: "系统".into(),
                kind: "open_path".into(),
                payload: "explorer".into(),
            },
            LauncherItem {
                id: "os-notepad".into(),
                title: "记事本".into(),
                subtitle: "C:\\Windows\\System32\\notepad.exe".into(),
                kind: "open_path".into(),
                payload: "C:\\Windows\\System32\\notepad.exe".into(),
            },
        ]
    }
    #[cfg(target_os = "macos")]
    {
        vec![LauncherItem {
            id: "os-finder".into(),
            title: "访达".into(),
            subtitle: "Finder".into(),
            kind: "open_path".into(),
            payload: "/System/Library/CoreServices/Finder.app".into(),
        }]
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        vec![]
    }
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
        _ => return Err("未知类型".into()),
    }
    Ok(())
}
