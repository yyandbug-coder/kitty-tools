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

/// 保存前校验：任意项可为空以关闭该全局快捷键；非空项之间不得重复（忽略大小写）。
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
        if !seen.insert(s.to_lowercase()) {
            return Err(format!("快捷键不能重复：{}", s));
        }
    }
    Ok(())
}

// ── Clipboard shortcut ──────────────────────────────────────────────────

/// Register the clipboard toggle global shortcut, or unregister if `shortcut` is empty.
pub fn register_clipboard_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    let previous_shortcut = lock_poisoned(&CURRENT_CLIPBOARD_SHORTCUT).clone();

    if shortcut.is_empty() {
        if let Some(ref previous) = previous_shortcut {
            if let Ok(prev_parsed) = previous.parse::<Shortcut>() {
                let _ = global_shortcut.unregister(prev_parsed);
            }
        }
        *lock_poisoned(&CURRENT_CLIPBOARD_SHORTCUT) = None;
        return Ok(());
    }

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

/// 划词翻译全局键：空则注销。
fn register_selection_translate_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    let previous = lock_poisoned(&CURRENT_SELECTION_SHORTCUT).clone();

    if shortcut.is_empty() {
        if let Some(ref prev) = previous {
            if let Ok(parsed) = Shortcut::from_str(prev) {
                let _ = global_shortcut.unregister(parsed);
            }
        }
        *lock_poisoned(&CURRENT_SELECTION_SHORTCUT) = None;
        return Ok(());
    }

    if previous.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed = Shortcut::from_str(shortcut).map_err(|e| format!("划词快捷键无效：{}", e))?;

    if let Some(ref previous) = previous {
        if let Ok(prev_parsed) = previous.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(prev_parsed);
        }
    }
    let _ = global_shortcut.unregister(parsed);

    global_shortcut
        .on_shortcut(parsed, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let _ = app.emit("hotkey-selection-translate", ());
        })
        .map_err(|error| format!("划词快捷键注册失败：{error}"))?;

    *lock_poisoned(&CURRENT_SELECTION_SHORTCUT) = Some(shortcut.to_string());
    Ok(())
}

/// 截图翻译全局键：空则注销。
fn register_screenshot_translate_shortcut<R: Runtime>(
    app: &tauri::AppHandle<R>,
    shortcut: &str,
) -> Result<(), String> {
    let global_shortcut = app.global_shortcut();
    let previous = lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT).clone();

    if shortcut.is_empty() {
        if let Some(ref prev) = previous {
            if let Ok(parsed) = Shortcut::from_str(prev) {
                let _ = global_shortcut.unregister(parsed);
            }
        }
        *lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT) = None;
        return Ok(());
    }

    if previous.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed = Shortcut::from_str(shortcut).map_err(|e| format!("截图快捷键无效：{}", e))?;

    if let Some(ref previous) = previous {
        if let Ok(prev_parsed) = previous.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(prev_parsed);
        }
    }
    let _ = global_shortcut.unregister(parsed);

    global_shortcut
        .on_shortcut(parsed, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let _ = app.emit("hotkey-screenshot-translate", ());
        })
        .map_err(|error| format!("截图快捷键注册失败：{error}"))?;

    *lock_poisoned(&CURRENT_SCREENSHOT_SHORTCUT) = Some(shortcut.to_string());
    Ok(())
}

/// 同步划词与截图翻译快捷键（可单独为空）。
pub fn register_translate_shortcuts<R: Runtime>(
    app: &tauri::AppHandle<R>,
    selection_shortcut: &str,
    screenshot_shortcut: &str,
) -> Result<(), String> {
    if !selection_shortcut.is_empty()
        && !screenshot_shortcut.is_empty()
        && selection_shortcut.eq_ignore_ascii_case(screenshot_shortcut)
    {
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
