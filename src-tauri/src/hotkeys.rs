//! Global shortcut management for the consolidated kitty-tools app.
//!
//! Manages global shortcuts: clipboard, launcher, selection translate, screenshot translate.
//! Uses `tauri_plugin_global_shortcut` for cross-platform hotkey registration.
//! Translate shortcuts emit events that lib.rs handles via the translate pipeline.

use std::collections::HashSet;
use std::str::FromStr;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::app_state::lock_poisoned;
use crate::window;

// ── Static tracking of currently registered shortcuts ───────────────────

static CURRENT_CLIPBOARD_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SELECTION_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SCREENSHOT_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_LAUNCHER_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// 保存前校验：任意项可为空以关闭该全局快捷键；非空项之间不得重复。
///
/// 比较时按 Tauri 的 `Shortcut` 解析后归一化键位，避免 `Ctrl+Shift+V` 与 `Shift+Ctrl+V`、
/// `CmdOrCtrl+Shift+V` 与 `Ctrl+Shift+V` 等等价组合通过校验后到注册阶段才以「already registered」失败。
/// 解析失败时退化为 `to_lowercase()` 比较（与旧逻辑兼容）。
pub fn validate_hotkey_config(config: &crate::config::AppConfig) -> Result<(), String> {
    let mut seen: HashSet<String> = HashSet::new();
    for s in [
        config.clipboard_shortcut.trim(),
        config.hotkey_selection.trim(),
        config.hotkey_screenshot.trim(),
        config.launcher_shortcut.trim(),
    ] {
        if s.is_empty() {
            continue;
        }
        let key = normalize_shortcut_key(s);
        if !seen.insert(key) {
            return Err(format!("快捷键不能重复：{}", s));
        }
    }
    Ok(())
}

/// 把快捷键字符串归一化为稳定可比串：
/// 1. 优先用 Tauri 的 `Shortcut::from_str` 解析（自动消化 `CmdOrCtrl` / `Cmd` / `Command` 等别名）；
///    成功后用 `{:?}` Debug 输出（包含修饰位集合与主键），物理等价的两个写法 Debug 字符串相同。
/// 2. 解析失败回退到拆分小写排序，仍能消除大小写与修饰键顺序差异。
fn normalize_shortcut_key(input: &str) -> String {
    let trimmed = input.trim();
    if let Ok(parsed) = trimmed.parse::<Shortcut>() {
        return format!("{:?}", parsed);
    }
    let mut parts: Vec<String> = trimmed
        .split('+')
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty())
        .collect();
    parts.sort();
    parts.join("+")
}

// ── Generic register helper ────────────────────────────────────────────

/// 把「记录历史 → 空注销 → 同名跳过 → 解析 → 旧/新预清 → on_shortcut → 写历史」收口为一处，
/// 让 4 个 `register_*_shortcut` 仅描述各自的「无效/失败提示」与按键回调。
///
/// 闭包接收 `&AppHandle`，调用方据此 `emit` 或 `window::toggle_*`。
fn register_global_shortcut_slot<R, F>(
    app: &tauri::AppHandle<R>,
    slot: &Mutex<Option<String>>,
    shortcut: &str,
    invalid_label: &str,
    register_label: &str,
    handler: F,
) -> Result<(), String>
where
    R: Runtime,
    F: Fn(&tauri::AppHandle<R>) + Send + Sync + 'static,
{
    let global_shortcut = app.global_shortcut();
    let previous = lock_poisoned(slot).clone();

    if shortcut.is_empty() {
        if let Some(ref prev) = previous {
            if let Ok(parsed) = Shortcut::from_str(prev) {
                let _ = global_shortcut.unregister(parsed);
            }
        }
        *lock_poisoned(slot) = None;
        return Ok(());
    }

    if previous.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed = Shortcut::from_str(shortcut).map_err(|e| format!("{invalid_label}：{e}"))?;

    // 先注销旧值，再预清新值（避免崩溃后残留状态导致 `already registered`）。
    if let Some(ref prev) = previous {
        if let Ok(prev_parsed) = prev.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(prev_parsed);
        }
    }
    let _ = global_shortcut.unregister(parsed);

    let handler = Arc::new(handler);
    global_shortcut
        .on_shortcut(parsed, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let app_main = app.clone();
            let handler = Arc::clone(&handler);
            let _ = app.run_on_main_thread(move || {
                handler(&app_main);
            });
        })
        .map_err(|e| format!("{register_label}：{e}"))?;

    *lock_poisoned(slot) = Some(shortcut.to_string());
    Ok(())
}

// ── Clipboard shortcut ──────────────────────────────────────────────────

/// Register the clipboard toggle global shortcut, or unregister if `shortcut` is empty.
pub fn register_clipboard_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    register_global_shortcut_slot(
        app,
        &CURRENT_CLIPBOARD_SHORTCUT,
        shortcut,
        "快捷键格式无效",
        "快捷键注册失败",
        |app| window::toggle_clipboard_popup(app),
    )
}

// ── Translate shortcuts ─────────────────────────────────────────────────

/// 划词翻译全局键：空则注销。
fn register_selection_translate_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    register_global_shortcut_slot(
        app,
        &CURRENT_SELECTION_SHORTCUT,
        shortcut,
        "划词快捷键无效",
        "划词快捷键注册失败",
        |app| {
            let _ = app.emit("hotkey-selection-translate", ());
        },
    )
}

/// 截图翻译全局键：空则注销。
fn register_screenshot_translate_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    register_global_shortcut_slot(
        app,
        &CURRENT_SCREENSHOT_SHORTCUT,
        shortcut,
        "截图快捷键无效",
        "截图快捷键注册失败",
        |app| {
            let _ = app.emit("hotkey-screenshot-translate", ());
        },
    )
}

/// 同步划词与截图翻译快捷键（可单独为空）。
pub fn register_translate_shortcuts<R: Runtime>(
    app: &tauri::AppHandle<R>,
    selection_shortcut: &str,
    screenshot_shortcut: &str,
) -> Result<(), String> {
    if !selection_shortcut.is_empty()
        && !screenshot_shortcut.is_empty()
        && normalize_shortcut_key(selection_shortcut)
            == normalize_shortcut_key(screenshot_shortcut)
    {
        // 归一化后比较：`Ctrl+Shift+T` 与 `Shift+Ctrl+T`、`CmdOrCtrl+Shift+T` 与 `Ctrl+Shift+T` 等
        // 等价写法在此即可拦截，避免到注册阶段才报 "already registered"。
        return Err("划词与截图快捷键不能相同".to_string());
    }
    register_selection_translate_shortcut(app, selection_shortcut)?;
    register_screenshot_translate_shortcut(app, screenshot_shortcut)?;
    Ok(())
}

// ── Launcher shortcut ───────────────────────────────────────────────────

/// Register the launcher toggle shortcut, or unregister if `shortcut` is empty.
pub fn register_launcher_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    register_global_shortcut_slot(
        app,
        &CURRENT_LAUNCHER_SHORTCUT,
        shortcut,
        "启动器快捷键格式无效",
        "启动器快捷键注册失败",
        |app| window::toggle_launcher(app),
    )
}

// ── Sync all ────────────────────────────────────────────────────────────

/// Register all global shortcuts based on the current config.
///
/// This is the main entry point called during app setup and after config changes.
///
/// 注：`save_config_cmd` 在调用本函数前已自行 `validate_hotkey_config`，本函数不再重复校验，
/// 避免一次保存路径上重复扫描配置；首次启动 `setup` 路径里 `load_config()` 不经此校验，
/// 但应用启动期不期望热键冲突阻断初始化（即便有冲突，下游单项 `register_*` 会自然报错）。
pub fn sync_all_hotkeys<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &crate::config::AppConfig,
) -> Result<(), String> {
    register_clipboard_shortcut(app, config.clipboard_shortcut.trim())?;
    register_translate_shortcuts(
        app,
        config.hotkey_selection.trim(),
        config.hotkey_screenshot.trim(),
    )?;
    register_launcher_shortcut(app, config.launcher_shortcut.trim())?;
    Ok(())
}

/// Unregister all global shortcuts.
#[allow(dead_code)]
pub fn unregister_all<R: Runtime>(app: &tauri::AppHandle<R>) {
    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    *lock_poisoned(&CURRENT_CLIPBOARD_SHORTCUT) = None;
    *lock_poisoned(&CURRENT_SELECTION_SHORTCUT) = None;
    *lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT) = None;
    *lock_poisoned(&CURRENT_LAUNCHER_SHORTCUT) = None;
}
