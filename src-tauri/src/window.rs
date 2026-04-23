//! Window management for the consolidated kitty-tools app.
//!
//! Manages 6 windows: clipboard-popup, floating, region-select,
//! translate-workspace, settings, and onboarding. Provides platform-specific
//! show/hide/toggle logic for macOS (activation policy, frontmost app tracking)
//! and Windows (SetForegroundWindow).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::window::Color;
use tauri::{Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WindowEvent};

// ── Window label constants ──────────────────────────────────────────────

pub const WINDOW_CLIPBOARD_POPUP: &str = "clipboard-popup";
pub const WINDOW_FLOATING: &str = "floating";
pub const WINDOW_REGION_SELECT: &str = "region-select";
pub const WINDOW_TRANSLATE_WORKSPACE: &str = "translate-workspace";
pub const WINDOW_SETTINGS: &str = "settings";
pub const WINDOW_ONBOARDING: &str = "onboarding";

// ── macOS helpers ───────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
static PREVIOUS_APP_PID: Mutex<Option<i32>> = Mutex::new(None);

#[cfg(target_os = "macos")]
fn remember_frontmost_application() {
    unsafe {
        let workspace = objc2_app_kit::NSWorkspace::sharedWorkspace();
        let current_app = objc2_app_kit::NSRunningApplication::currentApplication();
        let current_pid = current_app.processIdentifier();

        if let Some(frontmost_app) = workspace.frontmostApplication() {
            let frontmost_pid = frontmost_app.processIdentifier();
            if frontmost_pid != current_pid {
                *PREVIOUS_APP_PID.lock().unwrap() = Some(frontmost_pid);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn restore_previous_application() {
    let pid = PREVIOUS_APP_PID.lock().unwrap().take();

    if let Some(pid) = pid {
        unsafe {
            if let Some(app) =
                objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
            {
                let _ =
                    app.activateWithOptions(objc2_app_kit::NSApplicationActivationOptions::empty());
            }
        }
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn activate_current_application() {
    unsafe {
        let app = objc2_app_kit::NSRunningApplication::currentApplication();
        let options =
            objc2_app_kit::NSApplicationActivationOptions::NSApplicationActivateIgnoringOtherApps
                | objc2_app_kit::NSApplicationActivationOptions::NSApplicationActivateAllWindows;
        let _ = app.activateWithOptions(options);
    }
}

// ── Dev / prod URL helper ───────────────────────────────────────────────

#[cfg(debug_assertions)]
fn webview_url(path: &str) -> WebviewUrl {
    WebviewUrl::External(
        format!("http://localhost:1420/{}", path)
            .parse()
            .expect("invalid dev url"),
    )
}

#[cfg(not(debug_assertions))]
fn webview_url(path: &str) -> WebviewUrl {
    WebviewUrl::App(path.into())
}

// ── Clipboard popup window ──────────────────────────────────────────────

/// Get or create the clipboard popup window.
///
/// Transparent, no decorations, always_on_top, skip_taskbar, not resizable,
/// initially invisible. Used as the Alfred-style clipboard history panel.
pub fn get_or_create_clipboard_popup_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        return Ok(w);
    }
    let window = WebviewWindow::builder(app, WINDOW_CLIPBOARD_POPUP, webview_url("index.html"))
        .title("Kitty Tools · 剪贴板")
        .inner_size(1080.0, 720.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .shadow(false)
        .center()
        .build()?;
    Ok(window)
}

/// Show the clipboard popup window (Alfred-style).
pub fn show_clipboard_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    {
        remember_frontmost_application();
        let _ = app.show();
        activate_current_application();
    }

    // Ensure window exists
    let _ = get_or_create_clipboard_popup_window(app);

    if let Some(window) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        let _ = window.show();

        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    use windows::Win32::Foundation::HWND;
                    use windows::Win32::UI::WindowsAndMessaging::{
                        IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
                    };
                    let hwnd = HWND(hwnd.0 as *mut _);
                    if IsIconic(hwnd).as_bool() {
                        let _ = ShowWindow(hwnd, SW_RESTORE);
                    }
                    let _ = SetForegroundWindow(hwnd);
                }
            }
        }
        let _ = window.set_focus();
    }
    let _ = app.emit("focus-clipboard-panel", ());
}

/// Hide the clipboard popup window.
pub fn hide_clipboard_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        let _ = window.hide();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
        restore_previous_application();
    }
}

/// Toggle clipboard popup based on visible + focused state.
pub fn toggle_clipboard_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            hide_clipboard_popup(app);
        } else {
            show_clipboard_popup(app);
        }
    }
}

// ── Floating translate window ───────────────────────────────────────────

/// Get or create the floating translate window.
///
/// Creates with: no decorations, always_on_top, skip_taskbar, resizable,
/// initially invisible. Restores saved position from config if available.
/// Registers handlers for save-position-on-move and auto-hide-on-blur.
pub fn get_or_create_floating_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_FLOATING) {
        return Ok(w);
    }

    let (saved_x, saved_y, pinned) = {
        let config = crate::config::load_config();
        (config.floating_window_x, config.floating_window_y, config.floating_pinned)
    };

    let mut builder =
        WebviewWindow::builder(app, WINDOW_FLOATING, webview_url("floating.html"))
            .title("Kitty 翻译 · 划词")
            .inner_size(680.0, 460.0)
            .min_inner_size(520.0, 360.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(true)
            .visible(false);

    builder = if let (Some(x), Some(y)) = (saved_x, saved_y) {
        builder.position(x as f64, y as f64)
    } else {
        builder.center()
    };

    let window = builder.build()?;

    register_floating_window_handlers(&window, app, pinned);
    Ok(window)
}

fn register_floating_window_handlers<R: Runtime>(
    window: &WebviewWindow<R>,
    app: &tauri::AppHandle<R>,
    _initial_pinned: bool,
) {
    let app_handle = app.clone();
    let window_handle = window.clone();
    let had_true_focus = Arc::new(AtomicBool::new(false));

    window.on_window_event(move |event| {
        match event {
            WindowEvent::Moved(position) => {
                // 拖拽已实际发生，清除交互标记
                let app_state = app_handle.state::<crate::app_state::AppState>();
                app_state.floating_interacting.store(false, Ordering::SeqCst);
                let _ = app_handle.emit(
                    "floating-window-moved",
                    serde_json::json!({"x": position.x, "y": position.y}),
                );
            }
            WindowEvent::Focused(true) => {
                // 拖拽结束（窗口重新获得焦点），清除交互标记
                let app_state = app_handle.state::<crate::app_state::AppState>();
                app_state.floating_interacting.store(false, Ordering::SeqCst);
                had_true_focus.store(true, Ordering::SeqCst);
            }
            WindowEvent::Focused(false) => {
                // 拖拽开始时前端通过 start_floating_drag 设置的标记，用于跳过拖拽瞬间的失焦自动隐藏
                let app_state = app_handle.state::<crate::app_state::AppState>();
                if app_state.floating_interacting.swap(false, Ordering::SeqCst) {
                    return;
                }
                let pinned = {
                    let cfg_state = app_handle.state::<std::sync::Mutex<crate::config::AppConfig>>();
                    let pinned = cfg_state.lock().unwrap().floating_pinned;
                    pinned
                };

                if !pinned && had_true_focus.load(Ordering::SeqCst) {
                    let _ = window_handle.hide();
                }
            }
            WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
                let _ = app_handle.emit("floating-window-closed", ());
            }
            _ => {}
        }
    });
}

/// Show the floating translate window.
pub fn show_floating_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let window = get_or_create_floating_window(app)?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

/// Hide the floating translate window.
pub fn hide_floating_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_FLOATING) {
        let _ = window.hide();
    }
}

// ── Region select window ────────────────────────────────────────────────

/// Get or create the region-select overlay window.
///
/// Transparent, no decorations, always_on_top, no shadow, not resizable,
/// initially invisible.
pub fn get_or_create_region_select_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_REGION_SELECT) {
        return Ok(w);
    }
    WebviewWindow::builder(app, WINDOW_REGION_SELECT, webview_url("region-select.html"))
        .title("")
        .inner_size(400.0, 300.0)
        .position(0.0, 0.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .background_color(Color::from((0u8, 0u8, 0u8, 0u8)))
        .visible(false)
        .build()
}

/// Show the region-select overlay, sized to virtual desktop bounds.
pub fn show_region_overlay<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    use tauri::{PhysicalPosition, PhysicalSize, Position, Size};

    let w = get_or_create_region_select_window(app)?;
    let (vx, vy, vw, vh) = crate::screenshot::virtual_screen_bounds().map_err(|e| tauri::Error::from(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
    w.set_position(Position::Physical(PhysicalPosition::new(vx, vy)))?;
    w.set_size(Size::Physical(PhysicalSize::new(vw, vh)))?;
    w.show()?;
    w.set_focus()?;
    Ok(())
}

/// Hide the region-select overlay.
pub fn hide_region_overlay<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window(WINDOW_REGION_SELECT) {
        let _ = w.hide();
    }
}

// ── Settings window ─────────────────────────────────────────────────────

/// Get or create the settings window.
///
/// 680x720, decorated, resizable, centered, skip_taskbar, initially invisible.
/// Registers close-to-hide handler.
pub fn get_or_create_settings_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_SETTINGS) {
        return Ok(w);
    }

    let window =
        WebviewWindow::builder(app, WINDOW_SETTINGS, webview_url("settings.html"))
            .title("Kitty Tools · 设置")
            .inner_size(680.0, 720.0)
            .min_inner_size(560.0, 600.0)
            .decorations(true)
            .resizable(true)
            .center()
            .visible(false)
            .build()?;

    let w_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w_clone.hide();
        }
    });

    Ok(window)
}

/// Show the settings window.
pub fn show_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let window = get_or_create_settings_window(app)?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

// ── Translate workspace window ──────────────────────────────────────────

/// Get or create the translate workspace window.
///
/// 800x600, decorated, resizable, centered, initially invisible.
/// Registers close-to-hide handler.
pub fn get_or_create_translate_workspace_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_TRANSLATE_WORKSPACE) {
        return Ok(w);
    }

    let window = WebviewWindow::builder(
        app,
        WINDOW_TRANSLATE_WORKSPACE,
        webview_url("translate-workspace.html"),
    )
    .title("Kitty 翻译 · 工作台")
    .inner_size(800.0, 600.0)
    .min_inner_size(560.0, 400.0)
    .decorations(true)
    .resizable(true)
    .center()
    .visible(false)
    .build()?;

    let w_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w_clone.hide();
        }
    });

    Ok(window)
}

/// Show the translate workspace window.
pub fn show_translate_workspace<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let window = get_or_create_translate_workspace_window(app)?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

// ── Onboarding window ───────────────────────────────────────────────────

/// Show the onboarding window (first-run setup).
pub fn show_onboarding_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let window = if let Some(w) = app.get_webview_window(WINDOW_ONBOARDING) {
        w
    } else {
        WebviewWindow::builder(app, WINDOW_ONBOARDING, webview_url("onboarding.html"))
            .title("Kitty Tools · 欢迎使用")
            .inner_size(560.0, 480.0)
            .decorations(true)
            .resizable(false)
            .center()
            .visible(false)
            .build()?
    };
    window.show()?;
    window.set_focus()?;
    Ok(())
}

// ── Tray-only app helpers ───────────────────────────────────────────────

/// Ensure the app behaves as a tray-only utility: no Dock icon (macOS),
/// no taskbar button (Windows).
pub fn ensure_tray_only_app<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "windows")]
    {
        for label in [
            WINDOW_CLIPBOARD_POPUP,
            WINDOW_FLOATING,
            WINDOW_REGION_SELECT,
            WINDOW_TRANSLATE_WORKSPACE,
            WINDOW_ONBOARDING,
        ] {
            if let Some(window) = app.get_webview_window(label) {
                let _ = window.set_skip_taskbar(true);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;
        app.set_dock_visibility(false)?;
    }

    Ok(())
}

/// Alias for show_settings_window — convenience for tray menu.
#[allow(dead_code)]
pub fn show_main_settings<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    show_settings_window(app)
}
