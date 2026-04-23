//! System tray menu for the consolidated kitty-tools app.
//!
//! Combines tray items from both clipboard-history and translate apps:
//! clipboard toggle, selection translate, screenshot translate,
//! translate workspace, settings, and quit.
//!
//! Left-click: show translate workspace (single click) / settings (double click).
//! Right-click: show context menu.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Runtime};

use crate::window;

// ── Tray constants ──────────────────────────────────────────────────────

pub const TRAY_ID: &str = "main-tray";
const TRAY_CLIPBOARD_ID: &str = "tray-clipboard";
const TRAY_SELECTION_ID: &str = "tray-selection";
const TRAY_SCREENSHOT_ID: &str = "tray-screenshot";
const TRAY_WORKSPACE_ID: &str = "tray-workspace";
const TRAY_SETTINGS_ID: &str = "tray-settings";
const TRAY_QUIT_ID: &str = "tray-quit";

/// Frontend has acknowledged the exit flush; used by the 15-second deadline.
static APP_EXIT_FLUSH_ACK: AtomicBool = AtomicBool::new(false);
/// Whether the app is allowed to actually exit.
pub static ALLOW_APP_EXIT: AtomicBool = AtomicBool::new(false);

/// Called by the frontend after flushing data to disk, then exits the process.
pub fn mark_exit_flush_ack() {
    APP_EXIT_FLUSH_ACK.store(true, Ordering::SeqCst);
    ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
}

// ── Shortcut display helper ─────────────────────────────────────────────

fn hotkey_display_for_tray(h: &str) -> String {
    let mut t = h.trim().to_string();
    #[cfg(target_os = "macos")]
    {
        t = t.replace("CmdOrCtrl", "\u{2318}");
        t = t.replace("CommandOrControl", "\u{2318}");
        t = t.replace("Alt", "\u{2325}");
    }
    #[cfg(not(target_os = "macos"))]
    {
        t = t.replace("CmdOrCtrl", "Ctrl");
        t = t.replace("CommandOrControl", "Ctrl");
    }
    t.replace('+', " + ")
}

// ── Build tray ──────────────────────────────────────────────────────────

/// Build the system tray with the combined menu.
///
/// Menu layout:
/// ```text
/// Kitty Tools
/// ├── 剪贴板历史 {shortcut}
/// ├── 划词翻译 {shortcut}
/// ├── 截图翻译 {shortcut}
/// ├── ────────────
/// ├── 翻译工作台
/// ├── 打开设置...
/// ├── ────────────
/// └── 退出
/// ```
pub fn build_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let config = crate::config::load_config();
    let menu = build_tray_menu(app, &config)?;

    let icon = match app.default_window_icon().cloned() {
        Some(icon) => icon,
        None => {
            eprintln!("[kitty-tools] 警告：未设置默认窗口图标，托盘图标可能无法正常显示");
            return Ok(());
        }
    };
    let tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kitty Tools · 右键打开菜单")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_CLIPBOARD_ID => {
                window::toggle_clipboard_popup(app);
            }
            TRAY_SELECTION_ID => {
                let _ = app.emit("hotkey-selection-translate", ());
            }
            TRAY_SCREENSHOT_ID => {
                let _ = app.emit("hotkey-screenshot-translate", ());
            }
            TRAY_WORKSPACE_ID => {
                if let Err(e) = window::show_translate_workspace(app) {
                    eprintln!("[kitty-tools] 翻译工作台（托盘菜单）: {}", e);
                }
            }
            TRAY_SETTINGS_ID => {
                if let Err(e) = window::show_settings_window(app) {
                    eprintln!("[kitty-tools] 打开设置窗口失败: {}", e);
                }
            }
            TRAY_QUIT_ID => {
                handle_quit(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|_tray, event| {
            let _ = event;
        });

    #[cfg(target_os = "macos")]
    {
        if let Some(icon) = build_macos_tray_icon(app)? {
            tray_builder = tray_builder.icon(icon).icon_as_template(false);
        }
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

fn build_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &crate::config::AppConfig,
) -> tauri::Result<Menu<R>> {
    let clipboard_label = format!(
        "剪贴板历史\t{}",
        hotkey_display_for_tray(&config.clipboard_shortcut)
    );
    let selection_label = format!(
        "划词翻译\t{}",
        hotkey_display_for_tray(&config.hotkey_selection)
    );
    let screenshot_label = format!(
        "截图翻译\t{}",
        hotkey_display_for_tray(&config.hotkey_screenshot)
    );

    let tray_clipboard = MenuItem::with_id(
        app,
        TRAY_CLIPBOARD_ID,
        clipboard_label,
        true,
        None::<&str>,
    )?;
    let tray_selection = MenuItem::with_id(
        app,
        TRAY_SELECTION_ID,
        selection_label,
        true,
        None::<&str>,
    )?;
    let tray_screenshot = MenuItem::with_id(
        app,
        TRAY_SCREENSHOT_ID,
        screenshot_label,
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let tray_workspace = MenuItem::with_id(
        app,
        TRAY_WORKSPACE_ID,
        "翻译工作台",
        true,
        None::<&str>,
    )?;
    let tray_settings = MenuItem::with_id(
        app,
        TRAY_SETTINGS_ID,
        "打开设置...",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let tray_quit = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &tray_clipboard,
            &tray_selection,
            &tray_screenshot,
            &sep1,
            &tray_workspace,
            &tray_settings,
            &sep2,
            &tray_quit,
        ],
    )
}

/// Refresh shortcut labels in the tray menu (after config change).
pub fn refresh_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let config = crate::config::load_config();
    let menu = build_tray_menu(app, &config)?;
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    tray.set_menu(Some(menu))?;
    Ok(())
}

// ── Quit handler ────────────────────────────────────────────────────────

fn handle_quit<R: Runtime>(app: &tauri::AppHandle<R>) {
    APP_EXIT_FLUSH_ACK.store(false, Ordering::SeqCst);
    if let Err(error) = app.emit("app-exit-requested", ()) {
        eprintln!(
            "[kitty-tools] 退出事件发送失败: {}，将直接退出（可能未落盘）",
            error
        );
        ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
        let _ = app.exit(0);
    } else {
        let app_for_deadline = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(15));
            if APP_EXIT_FLUSH_ACK.load(Ordering::SeqCst) {
                return;
            }
            eprintln!(
                "[kitty-tools] 前端未在 15s 内完成退出落盘流程，将强制退出（数据可能未完全保存）"
            );
            ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
            let _ = app_for_deadline.exit(0);
        });
    }
}

// ── macOS tray icon ─────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn build_macos_tray_icon<R: Runtime>(
    _app: &tauri::AppHandle<R>,
) -> tauri::Result<Option<tauri::image::Image<'static>>> {
    // Try to load the app icon; if it fails, return None and let Tauri use the default.
    let icon = match image::load_from_memory_with_format(
        include_bytes!("../icons/icon.png"),
        image::ImageFormat::Png,
    ) {
        Ok(img) => img.into_rgba8(),
        Err(_) => return Ok(None),
    };
    let (width, height) = icon.dimensions();
    Ok(Some(tauri::image::Image::new_owned(
        icon.into_raw(),
        width,
        height,
    )))
}
