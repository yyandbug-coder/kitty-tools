//! Global shortcut management for the consolidated kitty-tools app.
//!
//! Manages global shortcuts: clipboard, launcher, selection translate, screenshot translate.
//! Uses `tauri_plugin_global_shortcut` for cross-platform hotkey registration.
//! Translate shortcuts emit events that lib.rs handles via the translate pipeline.

use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Mutex;

use tauri::{Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::app_state::lock_poisoned;
use crate::window;

// ── Static tracking of currently registered shortcuts ───────────────────

static CURRENT_CLIPBOARD_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SELECTION_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SCREENSHOT_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_LAUNCHER_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

/// 保存前校验：非空快捷键不得与其它项重复（启动器可为空以关闭）。
pub fn validate_hotkey_config(config: &crate::config::AppConfig) -> Result<(), String> {
    let mut seen: HashSet<&str> = HashSet::new();
    for (_label, s) in [
        ("剪贴板历史", config.clipboard_shortcut.trim()),
        ("划词翻译", config.hotkey_selection.trim()),
        ("截图翻译", config.hotkey_screenshot.trim()),
    ] {
        if s.is_empty() {
            return Err("剪贴板与翻译相关快捷键不能为空".to_string());
        }
        if !seen.insert(s) {
            return Err(format!("快捷键不能重复：{}", s));
        }
    }
    let ls = config.launcher_shortcut.trim();
    if !ls.is_empty() && !seen.insert(ls) {
        return Err(format!("启动器快捷键与已有项重复：{}", ls));
    }
    Ok(())
}

// ── Clipboard shortcut ──────────────────────────────────────────────────

/// Register the clipboard toggle global shortcut.
///
/// Unregisters the previous shortcut if one was already registered.
pub fn register_clipboard_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    if shortcut.is_empty() {
        return Err("快捷键不能为空".to_string());
    }

    let global_shortcut = app.global_shortcut();
    let previous_shortcut = lock_poisoned(&CURRENT_CLIPBOARD_SHORTCUT).clone();

    if previous_shortcut.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed_shortcut = shortcut
        .parse::<Shortcut>()
        .map_err(|error| format!("快捷键格式无效：{error}"))?;

    // Unregister the old shortcut BEFORE registering the new one to avoid
    // a window where both shortcuts are active simultaneously.
    if let Some(ref previous) = previous_shortcut {
        if let Ok(prev_parsed) = previous.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(prev_parsed);
        }
    }

    // Also try to pre-clear the new shortcut to avoid "already registered" errors
    // caused by stale state from a previous crash.
    let _ = global_shortcut.unregister(parsed_shortcut);

    global_shortcut
        .on_shortcut(parsed_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            window::toggle_clipboard_popup(app);
        })
        .map_err(|error| format!("快捷键注册失败：{error}"))?;

    *lock_poisoned(&CURRENT_CLIPBOARD_SHORTCUT) = Some(shortcut.to_string());
    Ok(())
}

// ── Translate shortcuts ─────────────────────────────────────────────────

/// Register both translate shortcuts (selection + screenshot).
///
/// These emit events that lib.rs listens for and dispatches to the translate pipeline.
pub fn register_translate_shortcuts<R: Runtime>(
    app: &tauri::AppHandle<R>,
    selection_shortcut: &str,
    screenshot_shortcut: &str,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();

    // Validate first
    if selection_shortcut.is_empty() || screenshot_shortcut.is_empty() {
        return Err("快捷键不能为空".to_string());
    }
    if selection_shortcut.eq_ignore_ascii_case(screenshot_shortcut) {
        return Err("划词与截图快捷键不能相同".to_string());
    }

    let sel_parsed = Shortcut::from_str(selection_shortcut)
        .map_err(|e| format!("划词快捷键无效：{}", e))?;
    let cap_parsed = Shortcut::from_str(screenshot_shortcut)
        .map_err(|e| format!("截图快捷键无效：{}", e))?;

    // Unregister previous translate shortcuts
    unregister_translate_shortcuts_internal(app);

    // Try to pre-clear to avoid "already registered" errors
    let _ = global_shortcut.unregister(sel_parsed);
    let _ = global_shortcut.unregister(cap_parsed);

    // Register selection translate shortcut
    global_shortcut
        .on_shortcut(sel_parsed, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let _ = app.emit("hotkey-selection-translate", ());
        })
        .map_err(|error| format!("划词快捷键注册失败：{error}"))?;

    // Register screenshot translate shortcut
    global_shortcut
        .on_shortcut(cap_parsed, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let _ = app.emit("hotkey-screenshot-translate", ());
        })
        .map_err(|error| format!("截图快捷键注册失败：{error}"))?;

    *lock_poisoned(&CURRENT_SELECTION_SHORTCUT) = Some(selection_shortcut.to_string());
    *lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT) = Some(screenshot_shortcut.to_string());
    Ok(())
}

/// Unregister only the translate shortcuts (internal helper).
fn unregister_translate_shortcuts_internal<R: Runtime>(app: &tauri::AppHandle<R>) {
    let global_shortcut = app.global_shortcut();
    let prev_sel = lock_poisoned(&CURRENT_SELECTION_SHORTCUT).take();
    let prev_cap = lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT).take();

    if let Some(s) = prev_sel {
        if let Ok(parsed) = Shortcut::from_str(&s) {
            let _ = global_shortcut.unregister(parsed);
        }
    }
    if let Some(s) = prev_cap {
        if let Ok(parsed) = Shortcut::from_str(&s) {
            let _ = global_shortcut.unregister(parsed);
        }
    }
}

// ── Launcher shortcut ───────────────────────────────────────────────────

/// Register the launcher toggle shortcut, or unregister if `shortcut` is empty.
pub fn register_launcher_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    let previous = lock_poisoned(&CURRENT_LAUNCHER_SHORTCUT).clone();

    if shortcut.is_empty() {
        if let Some(ref prev) = previous {
            if let Ok(parsed) = Shortcut::from_str(prev) {
                let _ = global_shortcut.unregister(parsed);
            }
        }
        *lock_poisoned(&CURRENT_LAUNCHER_SHORTCUT) = None;
        return Ok(());
    }

    if previous.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed_shortcut = shortcut
        .parse::<Shortcut>()
        .map_err(|error| format!("启动器快捷键格式无效：{error}"))?;

    if let Some(ref previous) = previous {
        if let Ok(prev_parsed) = previous.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(prev_parsed);
        }
    }
    let _ = global_shortcut.unregister(parsed_shortcut);

    global_shortcut
        .on_shortcut(parsed_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            window::toggle_launcher(app);
        })
        .map_err(|error| format!("启动器快捷键注册失败：{error}"))?;

    *lock_poisoned(&CURRENT_LAUNCHER_SHORTCUT) = Some(shortcut.to_string());
    Ok(())
}

// ── Sync all ────────────────────────────────────────────────────────────

/// Register all global shortcuts based on the current config.
///
/// This is the main entry point called during app setup and after config changes.
pub fn sync_all_hotkeys<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &crate::config::AppConfig,
) -> Result<(), String> {
    validate_hotkey_config(config)?;
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
