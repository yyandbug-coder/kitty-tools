//! Window management for the consolidated kitty-tools app.
//!
//! Manages 7 windows: clipboard-popup, launcher, floating, region-select,
//! translate-workspace, settings, and onboarding. Provides platform-specific
//! show/hide/toggle logic for macOS (activation policy, frontmost app tracking)
//! and Windows (SetForegroundWindow).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
#[cfg(target_os = "macos")]
use std::sync::Mutex;
use tauri::window::Color;
use tauri::{Emitter, LogicalSize, Manager, Runtime, Size, WebviewUrl, WebviewWindow, WindowEvent};

// ── Window label constants ──────────────────────────────────────────────

pub const WINDOW_CLIPBOARD_POPUP: &str = "clipboard-popup";
pub const WINDOW_LAUNCHER: &str = "launcher";
pub const WINDOW_FLOATING: &str = "floating";
pub const WINDOW_REGION_SELECT: &str = "region-select";
pub const WINDOW_TRANSLATE_WORKSPACE: &str = "translate-workspace";
pub const WINDOW_SETTINGS: &str = "settings";
pub const WINDOW_ONBOARDING: &str = "onboarding";

/// 窗口语义枚举：供外部模块（lib.rs / tray.rs）做集中分发，避免重复 if/else。
/// 与 `pub fn show_*/hide_*/toggle_*` 一一对应；新窗口扩展只须在此与匹配处各加一项。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum WindowKind {
    ClipboardPopup,
    Launcher,
    Floating,
    RegionSelect,
    TranslateWorkspace,
    Settings,
    Onboarding,
}

impl WindowKind {
    /// 与 `WINDOW_*` 字符串常量一一对应，便于 `app.get_webview_window(kind.label())`。
    #[allow(dead_code)]
    pub fn label(&self) -> &'static str {
        match self {
            WindowKind::ClipboardPopup => WINDOW_CLIPBOARD_POPUP,
            WindowKind::Launcher => WINDOW_LAUNCHER,
            WindowKind::Floating => WINDOW_FLOATING,
            WindowKind::RegionSelect => WINDOW_REGION_SELECT,
            WindowKind::TranslateWorkspace => WINDOW_TRANSLATE_WORKSPACE,
            WindowKind::Settings => WINDOW_SETTINGS,
            WindowKind::Onboarding => WINDOW_ONBOARDING,
        }
    }
}

/// 集中分发：`toggle`（仅对支持 toggle 的窗口有效）。
#[allow(dead_code)]
pub fn toggle<R: Runtime>(app: &tauri::AppHandle<R>, kind: WindowKind) {
    match kind {
        WindowKind::ClipboardPopup => toggle_clipboard_popup(app),
        WindowKind::Launcher => toggle_launcher(app),
        // 其他窗口暂不支持 toggle 语义（floating 由翻译动作驱动；settings/onboarding/region-select 单向打开）。
        _ => {}
    }
}

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
                *PREVIOUS_APP_PID
                    .lock()
                    .unwrap_or_else(|e| e.into_inner()) = Some(frontmost_pid);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn restore_previous_application() {
    let pid = PREVIOUS_APP_PID
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take();

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

// ── Windows 11：无边框透明窗口的系统圆角（与标准标题栏窗口一致，避免直角外框与 CSS 圆角错位）
#[cfg(target_os = "windows")]
fn apply_windows_borderless_round_corners<R: Runtime>(window: &WebviewWindow<R>) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUNDSMALL,
    };

    let Ok(raw) = window.hwnd() else {
        return;
    };
    let hwnd = HWND(raw.0 as *mut _);
    // 与前端 `rounded-xl`（--radius-xl）尺度接近；`DWMWCP_ROUND` 偏大易与玻璃壳圆角错位
    let preference = DWMWCP_ROUNDSMALL;
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&preference).cast(),
            std::mem::size_of_val(&preference) as u32,
        );
    }
}

/// WebView2 默认会拦截 `Ctrl+T` 等「浏览器快捷键」，导致前端录制全局热键时只能录到三键组合（如 Ctrl+Shift+T）。
/// 与 wry 在 `browser_accelerator_keys = false` 时的行为对齐。
#[cfg(target_os = "windows")]
fn disable_webview_browser_accelerator_keys<R: Runtime>(window: &WebviewWindow<R>) {
    let _ = window.with_webview(|webview| {
        unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows::core::Interface;
            let controller = webview.controller();
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let Ok(settings) = core.Settings() else {
                return;
            };
            if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
    });
}

/// Windows：WebView2 浏览器快捷键关闭 + 抑制 Alt+Space 系统菜单，保证无边框窗口内可正常录制全局热键。
#[cfg(target_os = "windows")]
fn apply_windows_webview_post_create<R: Runtime>(window: &WebviewWindow<R>) {
    disable_webview_browser_accelerator_keys(window);
    if let Ok(raw) = window.hwnd() {
        use windows::Win32::Foundation::HWND;
        crate::win32_sysmenu::install_suppress_keyboard_sysmenu(HWND(raw.0 as *mut _));
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_windows_webview_post_create<R: Runtime>(_window: &WebviewWindow<R>) {}

// ── Clipboard popup window ──────────────────────────────────────────────

/// Get or create the clipboard popup window.
///
/// 不透明（与划词翻译浮窗一致）、无装饰、置顶、跳过任务栏、不可调大小，
/// 初始隐藏。用于 Alfred 风格剪贴板历史面板。
pub fn get_or_create_clipboard_popup_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        return Ok(w);
    }
    let window = WebviewWindow::builder(app, WINDOW_CLIPBOARD_POPUP, webview_url("html/clipboard-popup.html"))
        .title("Kitty Tools · 剪贴板")
        .inner_size(1080.0, 720.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .center()
        .build()?;
    apply_windows_webview_post_create(&window);
    register_clipboard_popup_handlers(&window, app);
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

/// 仅隐藏剪贴板浮层并通知前端；**不**执行 macOS 的 `app.hide()` / 恢复前台 App。
/// 供 `present_settings_window` 使用：若在此处把焦点还给上一应用，设置窗会一闪即失焦。
fn hide_clipboard_popup_layer<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        let _ = window.hide();
    }
    // 关闭后再通知前端重置搜索/滚动，避免打开时闪动
    let _ = app.emit("clipboard-panel-hidden", ());
}

/// Hide the clipboard popup window.
pub fn hide_clipboard_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    hide_clipboard_popup_layer(app);

    #[cfg(target_os = "macos")]
    {
        if app
            .state::<crate::app_state::AppState>()
            .suppress_macos_overlay_restore
            .load(Ordering::Acquire)
        {
            return;
        }
        let _ = app.hide();
        restore_previous_application();
    }
}

/// 通用的「失焦自动隐藏」事件订阅，给 clipboard / launcher 共用，避免两份相同逻辑漂移。
///
/// 行为：
/// - `Focused(true)` 时清掉拖拽交互标记并记下「曾真正聚焦过」；
/// - `Focused(false)` 时若拖拽交互标记被吃掉（拖拽瞬间失焦）则忽略；
/// - 否则按 `should_hide_on_unfocus()` 决定是否调用 `hide()`。
///
/// `pick_interacting` 返回当前窗口对应的拖拽交互原子标志（如 `clipboard_interacting`）。
fn register_auto_hide_on_blur<R, FInteract, FHide, FFlag>(
    window: &WebviewWindow<R>,
    app: &tauri::AppHandle<R>,
    pick_interacting: FInteract,
    should_hide_on_unfocus: FFlag,
    hide: FHide,
) where
    R: Runtime,
    FInteract: Fn(&crate::app_state::AppState) -> Arc<AtomicBool> + Send + Sync + 'static,
    FFlag: Fn(&crate::config::AppConfig) -> bool + Send + Sync + 'static,
    FHide: Fn(&tauri::AppHandle<R>) + Send + Sync + 'static,
{
    let app_handle = app.clone();
    let had_true_focus = Arc::new(AtomicBool::new(false));

    window.on_window_event(move |event| match event {
        WindowEvent::Focused(true) => {
            let app_state = app_handle.state::<crate::app_state::AppState>();
            pick_interacting(&app_state).store(false, Ordering::SeqCst);
            had_true_focus.store(true, Ordering::SeqCst);
        }
        WindowEvent::Focused(false) => {
            let app_state = app_handle.state::<crate::app_state::AppState>();
            if pick_interacting(&app_state).swap(false, Ordering::SeqCst) {
                return;
            }
            let do_hide = {
                let cfg_state = app_handle.state::<std::sync::Mutex<crate::config::AppConfig>>();
                let guard = crate::app_state::lock_poisoned(&*cfg_state);
                should_hide_on_unfocus(&guard)
            };
            if do_hide && had_true_focus.load(Ordering::SeqCst) {
                hide(&app_handle);
            }
        }
        _ => {}
    });
}

/// Register focus/blur handlers for the clipboard popup window.
fn register_clipboard_popup_handlers<R: Runtime>(
    window: &WebviewWindow<R>,
    app: &tauri::AppHandle<R>,
) {
    register_auto_hide_on_blur(
        window,
        app,
        |state| state.clipboard_interacting.clone(),
        |cfg| cfg.clipboard_hide_on_unfocus,
        |handle| hide_clipboard_popup(handle),
    );
}

/// Toggle clipboard popup based on visible state (regardless of focus).
pub fn toggle_clipboard_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_CLIPBOARD_POPUP) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            hide_clipboard_popup(app);
        } else {
            show_clipboard_popup(app);
        }
    }
}

// ── Launcher (command palette) window ─────────────────────────────────

/// 启动器内联尺寸下限（逻辑像素）。
const LAUNCHER_MIN_INNER_W: u32 = 360;
const LAUNCHER_MIN_INNER_H: u32 = 280;
/// 从配置恢复启动器时的逻辑尺寸上限：拦截误持久化的超大值（常见为 Retina 物理像素被当成逻辑尺寸），
/// 同时仍允许故意拉得较大的面板（高于典型 Alfred 窗口）。
const LAUNCHER_MAX_RESTORE_W: u32 = 1280;
const LAUNCHER_MAX_RESTORE_H: u32 = 900;

fn launcher_inner_size_from_config<R: Runtime>(app: &tauri::AppHandle<R>) -> (f64, f64) {
    let cfg_state = app.state::<std::sync::Mutex<crate::config::AppConfig>>();
    let g = crate::app_state::lock_poisoned(&*cfg_state);
    let w = g
        .launcher_window_width
        .unwrap_or(680)
        .clamp(LAUNCHER_MIN_INNER_W, LAUNCHER_MAX_RESTORE_W) as f64;
    let h = g
        .launcher_window_height
        .unwrap_or(480)
        .clamp(LAUNCHER_MIN_INNER_H, LAUNCHER_MAX_RESTORE_H) as f64;
    (w, h)
}

/// 关闭启动器时把物理 `inner_size` 转为逻辑尺寸写入配置；优先用当前显示器 `scale_factor`，
/// 避免无边框 WebView 在 macOS 上 `window.scale_factor()` 偶发偏低导致误存约 scale 倍的尺寸。
fn launcher_save_scale_factor<R: Runtime>(window: &WebviewWindow<R>) -> f64 {
    let window_sf = window.scale_factor().unwrap_or(1.0);
    if let Ok(Some(mon)) = window.current_monitor() {
        let mon_sf = mon.scale_factor();
        if mon_sf > window_sf + 0.05 {
            return mon_sf;
        }
    }
    window_sf
}

/// 创建启动器：不透明（与划词翻译浮窗一致）、无装饰、置顶、可调整大小。
pub fn get_or_create_launcher_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_LAUNCHER) {
        return Ok(w);
    }
    let (iw, ih) = launcher_inner_size_from_config(app);
    let window = WebviewWindow::builder(app, WINDOW_LAUNCHER, webview_url("html/launcher.html"))
        .title("Kitty Tools · 启动器")
        .inner_size(iw, ih)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .min_inner_size(LAUNCHER_MIN_INNER_W as f64, LAUNCHER_MIN_INNER_H as f64)
        .visible(false)
        .center()
        .build()?;
    apply_windows_webview_post_create(&window);
    register_launcher_handlers(&window, app);
    Ok(window)
}

/// 显示启动器并聚焦。
pub fn show_launcher<R: Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    {
        remember_frontmost_application();
        let _ = app.show();
        activate_current_application();
    }

    let _ = get_or_create_launcher_window(app);

    if let Some(window) = app.get_webview_window(WINDOW_LAUNCHER) {
        let (iw, ih) = launcher_inner_size_from_config(app);
        let _ = window.set_size(Size::Logical(LogicalSize::new(iw, ih)));
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
    let _ = app.emit("focus-launcher-panel", ());
}

/// 失焦时按配置决定是否自动隐藏；拖拽瞬间失焦不隐藏（与剪贴板/翻译浮层一致，见 `launcher_interacting`）。
fn register_launcher_handlers<R: Runtime>(window: &WebviewWindow<R>, app: &tauri::AppHandle<R>) {
    register_auto_hide_on_blur(
        window,
        app,
        |state| state.launcher_interacting.clone(),
        |cfg| cfg.launcher_hide_on_unfocus,
        |handle| hide_launcher(handle),
    );
}

#[allow(dead_code)]
fn register_launcher_handlers_legacy<R: Runtime>(window: &WebviewWindow<R>, app: &tauri::AppHandle<R>) {
    let app_handle = app.clone();
    let had_true_focus = Arc::new(AtomicBool::new(false));

    window.on_window_event(move |event| {
        match event {
            WindowEvent::Focused(true) => {
                let app_state = app_handle.state::<crate::app_state::AppState>();
                app_state.launcher_interacting.store(false, Ordering::SeqCst);
                had_true_focus.store(true, Ordering::SeqCst);
            }
            WindowEvent::Focused(false) => {
                let app_state = app_handle.state::<crate::app_state::AppState>();
                if app_state.launcher_interacting.swap(false, Ordering::SeqCst) {
                    return;
                }
                let hide_on_unfocus = {
                    let cfg_state = app_handle.state::<std::sync::Mutex<crate::config::AppConfig>>();
                    let guard = crate::app_state::lock_poisoned(&*cfg_state);
                    guard.launcher_hide_on_unfocus
                };
                if hide_on_unfocus && had_true_focus.load(Ordering::SeqCst) {
                    hide_launcher(&app_handle);
                }
            }
            _ => {}
        }
    });
}

/// 仅隐藏启动器并持久化尺寸；**不**执行 macOS 的 `app.hide()` / 恢复前台 App（见 `hide_clipboard_popup_layer`）。
fn hide_launcher_layer<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LAUNCHER) {
        // `inner_size()` 为物理像素；创建窗口时 `inner_size(w,h)` 为逻辑像素（尤其 macOS Retina）。
        // 若换算用的 scale 偏小，会把物理像素误存为逻辑尺寸，下次打开接近全屏、内容挤在上方。
        if let Ok(physical) = window.inner_size() {
            let scale = launcher_save_scale_factor(&window);
            let w = ((physical.width as f64) / scale).round() as u32;
            let h = ((physical.height as f64) / scale).round() as u32;
            if (320..=4096).contains(&w) && (200..=4096).contains(&h) {
                let cfg_state = app.state::<std::sync::Mutex<crate::config::AppConfig>>();
                let mut cfg = crate::app_state::lock_poisoned(&*cfg_state).clone();
                if cfg.launcher_window_width != Some(w) || cfg.launcher_window_height != Some(h) {
                    cfg.launcher_window_width = Some(w);
                    cfg.launcher_window_height = Some(h);
                    if let Ok(saved) = crate::config::save_config(&cfg) {
                        *crate::app_state::lock_poisoned(&*cfg_state) = saved;
                    }
                }
            }
        }
        let _ = window.hide();
    }
}

/// 隐藏启动器。
pub fn hide_launcher<R: Runtime>(app: &tauri::AppHandle<R>) {
    hide_launcher_layer(app);

    #[cfg(target_os = "macos")]
    {
        if app
            .state::<crate::app_state::AppState>()
            .suppress_macos_overlay_restore
            .load(Ordering::Acquire)
        {
            return;
        }
        let _ = app.hide();
        restore_previous_application();
    }
}

/// 按可见性切换启动器显示。
pub fn toggle_launcher<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(WINDOW_LAUNCHER) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            hide_launcher(app);
        } else {
            show_launcher(app);
        }
    } else {
        show_launcher(app);
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
        WebviewWindow::builder(app, WINDOW_FLOATING, webview_url("html/floating.html"))
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
    apply_windows_webview_post_create(&window);

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
                    let p = crate::app_state::lock_poisoned(&*cfg_state).floating_pinned;
                    p
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
    let window = WebviewWindow::builder(app, WINDOW_REGION_SELECT, webview_url("html/region-select.html"))
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
        .build()?;
    apply_windows_webview_post_create(&window);
    Ok(window)
}

/// Show the region-select overlay, sized to virtual desktop bounds.
pub fn show_region_overlay<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let w = get_or_create_region_select_window(app)?;
    let (vx, vy, vw, vh) = crate::screenshot::virtual_screen_bounds()
        .map_err(|e| tauri::Error::from(std::io::Error::other(e)))?;

    // macOS: `display_info` / CGDisplayBounds 为点坐标；Tauri 的 Physical 为设备像素，
    // 误用 Physical 会在 Retina 下把窗口缩小约 1/scale，导致遮罩只盖住部分屏幕。
    #[cfg(target_os = "macos")]
    {
        use core_graphics::display::CGDisplay;
        use tauri::{LogicalPosition, LogicalSize, Position, Size};
        let top_y = CGDisplay::main().pixels_high() as f64 - (vy as f64 + vh as f64);
        w.set_position(Position::Logical(LogicalPosition::new(vx as f64, top_y)))?;
        w.set_size(Size::Logical(LogicalSize::new(vw as f64, vh as f64)))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::{PhysicalPosition, PhysicalSize, Position, Size};
        w.set_position(Position::Physical(PhysicalPosition::new(vx, vy)))?;
        w.set_size(Size::Physical(PhysicalSize::new(vw, vh)))?;
    }
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
/// 680x720，**无系统标题栏**（与启动器/剪贴板浮层一致）、可调整大小、居中、初始不可见；前端须设 `data-tauri-drag-region`。
/// Registers close-to-hide handler.
pub fn get_or_create_settings_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_SETTINGS) {
        return Ok(w);
    }

    let window =
        WebviewWindow::builder(app, WINDOW_SETTINGS, webview_url("html/index.html"))
            .title("Kitty Tools · 设置")
            .inner_size(680.0, 720.0)
            .min_inner_size(560.0, 600.0)
            .decorations(false)
            .resizable(true)
            .center()
            .visible(false)
            .build()?;
    apply_windows_webview_post_create(&window);

    let app_on_close = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = hide_settings_window(&app_on_close);
        }
    });

    Ok(window)
}

/// 先隐藏可能遮挡设置的浮层，再显示设置窗口（与前端 `open_settings_window`、托盘「设置」一致）。
///
/// macOS：`hide_*_layer` 会触发剪贴板/启动器的 `Focused(false)`，其回调会再次调用 `hide_clipboard_popup` /
/// `hide_launcher`；期间须 `suppress_macos_overlay_restore`，否则 `restore_previous_application` 会抢走设置窗焦点。
pub fn present_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    app.state::<crate::app_state::AppState>()
        .suppress_macos_overlay_restore
        .store(true, Ordering::Release);

    let result = (|| {
        hide_floating_window(app);
        hide_clipboard_popup_layer(app);
        hide_launcher_layer(app);
        #[cfg(target_os = "macos")]
        {
            let _ = app.show();
            activate_current_application();
        }
        show_settings_window(app)
    })();

    #[cfg(target_os = "macos")]
    app.state::<crate::app_state::AppState>()
        .suppress_macos_overlay_restore
        .store(false, Ordering::Release);

    result
}

/// Show the settings window.
pub fn show_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let _ = macos_apply_settings_visible_dock(app);
    }
    let window = get_or_create_settings_window(app)?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

/// 隐藏设置窗口；macOS 上恢复无 Dock 的托盘模式（与关闭按钮、系统关闭一致）。
pub fn hide_settings_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(WINDOW_SETTINGS) {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = macos_apply_tray_only_no_dock(app);
    }
    Ok(())
}

// ── Translate workspace window ──────────────────────────────────────────

/// Get or create the translate workspace window.
///
/// 800x600，**无系统标题栏**（与启动器/剪贴板浮层一致）、可调整、居中、初始不可见；前端须设 `data-tauri-drag-region`。
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
        webview_url("html/translate-workspace.html"),
    )
    .title("Kitty 翻译 · 工作台")
    .inner_size(800.0, 600.0)
    .min_inner_size(560.0, 400.0)
    .decorations(false)
    .resizable(true)
    .center()
    .visible(false)
    .build()?;
    apply_windows_webview_post_create(&window);

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

/// Get or create the onboarding window（实例常驻、仅 hide；预载避免 dev 子页 404）
///
/// 560x480，**无系统标题栏**（`decorations(false)`）、不可调整大小、**始终置顶**。须在前端设 `data-tauri-drag-region` 以便拖动。
/// 关闭请求一律忽略（须用前端完成/跳过调用 `hide()`）。
pub fn get_or_create_onboarding_window<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<WebviewWindow<R>> {
    if let Some(w) = app.get_webview_window(WINDOW_ONBOARDING) {
        return Ok(w);
    }

    let window = WebviewWindow::builder(
        app,
        WINDOW_ONBOARDING,
        webview_url("html/onboarding.html"),
    )
    .title("Kitty Tools · 欢迎使用")
    .inner_size(560.0, 480.0)
    .decorations(false)
    .resizable(false)
    .always_on_top(true)
    .center()
    .visible(false)
    .build()?;

    #[cfg(target_os = "windows")]
    {
        apply_windows_borderless_round_corners(&window);
        let _ = window.set_skip_taskbar(true);
    }
    apply_windows_webview_post_create(&window);

    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
        }
    });

    Ok(window)
}

/// Show the onboarding window (first-run or「打开引导页」)
pub fn show_onboarding_window<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let window = get_or_create_onboarding_window(app)?;
    let _ = app.emit("onboarding-did-open", serde_json::json!({}));
    let _ = window.set_always_on_top(true);
    window.show()?;
    window.set_focus()?;
    Ok(())
}

// ── Tray-only app helpers ───────────────────────────────────────────────

/// macOS：托盘/浮层模式——Accessory，不占用程序坞（与「仅打开设置时显示 Dock」配合）。
#[cfg(target_os = "macos")]
fn macos_apply_tray_only_no_dock<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    app.set_activation_policy(tauri::ActivationPolicy::Accessory)?;
    app.set_dock_visibility(false)?;
    Ok(())
}

/// macOS：设置窗口在前台时显示程序坞，便于从 Dock 点回设置。
#[cfg(target_os = "macos")]
fn macos_apply_settings_visible_dock<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    app.set_activation_policy(tauri::ActivationPolicy::Regular)?;
    app.set_dock_visibility(true)?;
    Ok(())
}

/// 桌面集成策略：Windows 侧隐藏浮层任务栏按钮（设置窗除外）；macOS 默认无 Dock，见 `macos_apply_settings_visible_dock`。
pub fn ensure_tray_only_app<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    #[cfg(target_os = "windows")]
    {
        // 设置窗不列入：保留任务栏入口，方便在长会话设置或 Alt+Tab 中找回窗口。
        for label in [
            WINDOW_CLIPBOARD_POPUP,
            WINDOW_LAUNCHER,
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
        macos_apply_tray_only_no_dock(app)?;
    }

    Ok(())
}

/// Alias for show_settings_window — convenience for tray menu.
#[allow(dead_code)]
pub fn show_main_settings<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    present_settings_window(app)
}
