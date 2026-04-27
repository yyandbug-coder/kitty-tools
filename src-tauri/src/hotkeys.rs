//! Global shortcut management for the consolidated kitty-tools app.
//!
//! Manages 3 shortcuts: clipboard toggle, selection translate, screenshot translate.
//! Uses `tauri_plugin_global_shortcut` for cross-platform hotkey registration.
//! Translate shortcuts emit events that lib.rs handles via the translate pipeline.

use std::str::FromStr;
use std::sync::Mutex;

use tauri::{Emitter, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::window;

// ── Static tracking of currently registered shortcuts ───────────────────

static CURRENT_CLIPBOARD_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SELECTION_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
static CURRENT_SCREENSHOT_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);

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
    let previous_shortcut = CURRENT_CLIPBOARD_SHORTCUT.lock().unwrap().clone();

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

    *CURRENT_CLIPBOARD_SHORTCUT.lock().unwrap() = Some(shortcut.to_string());
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

    *CURRENT_SELECTION_SHORTCUT.lock().unwrap() = Some(selection_shortcut.to_string());
    *CURRENT_SCREENSHOT_SHORTCUT.lock().unwrap() = Some(screenshot_shortcut.to_string());
    Ok(())
}

/// Unregister only the translate shortcuts (internal helper).
fn unregister_translate_shortcuts_internal<R: Runtime>(app: &tauri::AppHandle<R>) {
    let global_shortcut = app.global_shortcut();
    let prev_sel = CURRENT_SELECTION_SHORTCUT.lock().unwrap().take();
    let prev_cap = CURRENT_SCREENSHOT_SHORTCUT.lock().unwrap().take();

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

// ── Sync all ────────────────────────────────────────────────────────────

/// Register all 3 shortcuts based on the current config.
///
/// This is the main entry point called during app setup and after config changes.
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
    Ok(())
}

/// Unregister all global shortcuts.
#[allow(dead_code)]
pub fn unregister_all<R: Runtime>(app: &tauri::AppHandle<R>) {
    let global_shortcut = app.global_shortcut();
    let _ = global_shortcut.unregister_all();

    *CURRENT_CLIPBOARD_SHORTCUT.lock().unwrap() = None;
    *CURRENT_SELECTION_SHORTCUT.lock().unwrap() = None;
    *CURRENT_SCREENSHOT_SHORTCUT.lock().unwrap() = None;
}
