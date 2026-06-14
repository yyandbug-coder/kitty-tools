//! System tray menu for the consolidated kitty-tools app.
//!
//! Combines tray items from both clipboard-history and translate apps:
//! clipboard toggle, selection translate, screenshot translate,
//! settings, and quit.
//!
//! Right-click: show context menu. Left-click: open main hub (feature home page).

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, Runtime};

use crate::window;

// ── Tray constants ──────────────────────────────────────────────────────

pub const TRAY_ID: &str = "main-tray";
const TRAY_CLIPBOARD_ID: &str = "tray-clipboard";
const TRAY_LAUNCHER_ID: &str = "tray-launcher";
const TRAY_SELECTION_ID: &str = "tray-selection";
const TRAY_SCREENSHOT_ID: &str = "tray-screenshot";
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
/// ├── 启动器 {shortcut}
/// ├── 划词翻译 {shortcut}
/// ├── 截图翻译 {shortcut}
/// ├── ────────────
/// ├── 打开主界面...
/// ├── ────────────
/// └── 退出
/// ```
///
/// `config` 须与当前应用内存态一致（启动时来自 `load_config` / `Mutex<AppConfig>`，保存后来自 `save_config` 返回值）。
fn tray_icon_fallback() -> Option<tauri::image::Image<'static>> {
    let icon = image::load_from_memory_with_format(
        include_bytes!("../icons/icon.png"),
        image::ImageFormat::Png,
    )
    .ok()?
    .into_rgba8();
    let (width, height) = icon.dimensions();
    Some(tauri::image::Image::new_owned(
        icon.into_raw(),
        width,
        height,
    ))
}

pub fn build_tray<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &crate::config::AppConfig,
) -> tauri::Result<()> {
    let menu = build_tray_menu(app, config)?;

    let mut icon = app.default_window_icon().cloned();
    if icon.is_none() {
        icon = tray_icon_fallback();
    }
    let Some(icon) = icon else {
        eprintln!(
            "[kitty-tools] 警告：无法加载托盘图标（默认图标与内嵌 icon.png 均不可用）"
        );
        return Ok(());
    };
    // `mut` is required on macOS so we can swap in `build_macos_tray_icon`; unused on other targets.
    #[allow(unused_mut)]
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kitty Tools · 左键打开主界面，右键菜单")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_CLIPBOARD_ID => {
                let app_main = app.clone();
                let _ = app.run_on_main_thread(move || {
                    window::toggle_clipboard_popup(&app_main);
                });
            }
            TRAY_LAUNCHER_ID => {
                let app_main = app.clone();
                let _ = app.run_on_main_thread(move || {
                    window::toggle_launcher(&app_main);
                });
            }
            TRAY_SELECTION_ID => {
                let _ = app.emit("hotkey-selection-translate", ());
            }
            TRAY_SCREENSHOT_ID => {
                let _ = app.emit("hotkey-screenshot-translate", ());
            }
            TRAY_SETTINGS_ID => {
                let app_main = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = window::present_main_hub_window(&app_main) {
                        eprintln!("[kitty-tools] 打开主界面失败: {}", e);
                    }
                });
            }
            TRAY_QUIT_ID => {
                handle_quit(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let app_main = app.clone();
                let _ = app.run_on_main_thread(move || {
                    if let Err(e) = window::present_main_hub_window(&app_main) {
                        eprintln!("[kitty-tools] 托盘左键打开主界面失败: {}", e);
                    }
                });
            }
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
    let clipboard_label = if config.clipboard_shortcut.trim().is_empty() {
        "剪贴板历史（未设置快捷键）".to_string()
    } else {
        format!(
            "剪贴板历史\t{}",
            hotkey_display_for_tray(&config.clipboard_shortcut)
        )
    };
    let launcher_short = config.launcher_shortcut.trim();
    let launcher_label = if launcher_short.is_empty() {
        "启动器（未设置快捷键）".to_string()
    } else {
        format!(
            "启动器\t{}",
            hotkey_display_for_tray(&config.launcher_shortcut)
        )
    };
    let selection_label = if config.hotkey_selection.trim().is_empty() {
        "划词翻译（未设置快捷键）".to_string()
    } else {
        format!(
            "划词翻译\t{}",
            hotkey_display_for_tray(&config.hotkey_selection)
        )
    };
    let screenshot_label = if config.hotkey_screenshot.trim().is_empty() {
        "截图翻译（未设置快捷键）".to_string()
    } else {
        format!(
            "截图翻译\t{}",
            hotkey_display_for_tray(&config.hotkey_screenshot)
        )
    };

    let tray_clipboard = MenuItem::with_id(
        app,
        TRAY_CLIPBOARD_ID,
        clipboard_label,
        true,
        None::<&str>,
    )?;
    let tray_launcher = MenuItem::with_id(
        app,
        TRAY_LAUNCHER_ID,
        launcher_label,
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
    let tray_settings = MenuItem::with_id(
        app,
        TRAY_SETTINGS_ID,
        "打开主界面...",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let tray_quit = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &tray_clipboard,
            &tray_launcher,
            &tray_selection,
            &tray_screenshot,
            &sep1,
            &tray_settings,
            &sep2,
            &tray_quit,
        ],
    )
}

/// Refresh shortcut labels in the tray menu (after config change).
pub fn refresh_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &crate::config::AppConfig,
) -> tauri::Result<()> {
    let menu = build_tray_menu(app, config)?;
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };
    tray.set_menu(Some(menu))?;
    Ok(())
}

// ── Quit handler ────────────────────────────────────────────────────────

fn handle_quit<R: Runtime>(app: &tauri::AppHandle<R>) {
    APP_EXIT_FLUSH_ACK.store(false, Ordering::SeqCst);
    // 只向剪贴板窗口发送，避免其它 WebView 抢先 `exit_after_flush` 导致未落盘。
    let emit_result = match app.get_webview_window(window::WINDOW_CLIPBOARD_POPUP) {
        Some(w) => w.emit("app-exit-requested", ()),
        None => app.emit("app-exit-requested", ()),
    };
    if let Err(error) = emit_result {
        eprintln!(
            "[kitty-tools] 退出事件发送失败: {}，将直接退出（可能未落盘）",
            error
        );
        ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
        app.exit(0);
    } else {
        // 双段超时：3s 内仍未 ack 即提示「正在保存…」并继续等 12s；总计 15s 后强制退出。
        let app_overdue = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(3));
            if APP_EXIT_FLUSH_ACK.load(Ordering::SeqCst) {
                return;
            }
            // 通知所有窗口给出「保存中」提示；优先剪贴板窗口（前端会展示 toast）。
            let _ = app_overdue.emit("exit-flush-overdue", ());
        });
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
            app_for_deadline.exit(0);
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
