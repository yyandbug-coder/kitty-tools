#[cfg(target_os = "macos")]
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{imageops, ImageBuffer, ImageEncoder, RgbaImage};
#[cfg(target_os = "macos")]
use image::ImageFormat as MacosImageFormat;
#[cfg(target_os = "macos")]
use objc2::rc::Retained;
#[cfg(target_os = "macos")]
use objc2::runtime::{AnyClass, AnyObject, ProtocolObject};
#[cfg(target_os = "macos")]
use objc2::ClassType;
#[cfg(target_os = "macos")]
use objc2_app_kit::NSPasteboard;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSArray, NSString, NSURL};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
#[cfg(target_os = "macos")]
use std::ffi::CStr;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
};
#[cfg(target_os = "macos")]
use tauri::image::Image;
use tauri::{
    menu::{Menu, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, Runtime, WindowEvent,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
#[cfg(target_os = "macos")]
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
#[cfg(target_os = "macos")]
use std::ffi::c_void;
#[cfg(target_os = "macos")]
use std::ptr::NonNull;

#[cfg(target_os = "macos")]
static PREVIOUS_APP_PID: Mutex<Option<i32>> = Mutex::new(None);
static CLIPBOARD_WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
static ALLOW_APP_EXIT: AtomicBool = AtomicBool::new(false);
/// 前端已调用 `exit_after_flush`（落盘流程结束）；用于托盘退出超时后是否强制杀进程
static APP_EXIT_FLUSH_ACK: AtomicBool = AtomicBool::new(false);
static IMAGE_CACHE: Mutex<Vec<CachedImage>> = Mutex::new(Vec::new());
static CURRENT_GLOBAL_SHORTCUT: Mutex<Option<String>> = Mutex::new(None);
const MAX_CACHED_IMAGES: usize = 100;
const MAX_CACHED_IMAGE_BYTES: usize = 48 * 1024 * 1024;
const APP_ICON_CACHE_CAP: usize = 64;
const DEFAULT_GLOBAL_SHORTCUT: &str = "CommandOrControl+Shift+V";

static APP_ICON_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

const TRAY_ID: &str = "main-tray";
const TRAY_TOGGLE_ID: &str = "tray-toggle";
const TRAY_SETTINGS_ID: &str = "tray-settings";
const TRAY_QUIT_ID: &str = "tray-quit";
const CLIPBOARD_PANEL_LABEL: &str = "clipboard-panel";

// 剪贴板事件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEvent {
    pub id: String,
    pub r#type: String,
    pub content: String,
    pub content_hash: Option<String>,
    pub image_byte_size: Option<usize>,
    #[serde(default)]
    pub file_byte_sizes: Option<Vec<u64>>,
    pub file_paths: Option<Vec<String>>,
    pub image_rgba: Option<Vec<u8>>,
    pub image_width: Option<usize>,
    pub image_height: Option<usize>,
    pub timestamp: i64,
    /// 捕获到该条复制时，前台应用名称（启发式，非系统保证）
    pub source_app: Option<String>,
    /// 用于解析图标的应用路径（macOS 多为 .bundle；Windows 为 exe 完整路径）
    pub source_app_path: Option<String>,
    /// 前端收藏标记；剪贴板同步事件通常不含此项
    #[serde(default)]
    pub favorited: Option<bool>,
}

#[derive(Clone)]
struct CachedImage {
    id: String,
    width: usize,
    height: usize,
    bytes: Vec<u8>,
}

const PREVIEW_MAX_EDGE: u32 = 420;

/// 磁盘 v1：魔数 + 宽/高（u32 LE）+ 原始 RGBA（旧数据兼容）
const CLIPBOARD_IMAGE_MAGIC: &[u8; 4] = b"KCH\x01";
/// 磁盘 v2：魔数 + 宽/高 + PNG 长度 + PNG 压缩数据（显著减小体积与 IO）
const CLIPBOARD_IMAGE_MAGIC_PNG: &[u8; 4] = b"KCH\x02";
/// 超过此大小的 RGBA 不放入内存 ImageCache，仅从磁盘按需解码（避免多张大图占满 RAM）
const MAX_IN_MEMORY_RGBA_BYTES: usize = 8 * 1024 * 1024;

// 全局状态已移至线程内部

#[derive(Debug, Clone, Default)]
struct ClipboardSource {
    app_name: Option<String>,
    app_path: Option<String>,
}

/// 捕获复制时前台应用名称与可解析图标的路径（启发式，非系统保证）。
fn resolve_clipboard_source() -> ClipboardSource {
    #[cfg(target_os = "macos")]
    {
        resolve_clipboard_source_macos()
    }
    #[cfg(target_os = "windows")]
    {
        resolve_clipboard_source_windows()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        ClipboardSource::default()
    }
}

#[cfg(target_os = "macos")]
fn resolve_clipboard_source_macos() -> ClipboardSource {
    let mut name: Option<String> = None;
    let mut path: Option<String> = None;
    dispatch::Queue::main().exec_sync(|| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(front) = workspace.frontmostApplication() else {
            return;
        };
        let current = NSRunningApplication::currentApplication();
        if front.processIdentifier() == current.processIdentifier() {
            return;
        }
        if let Some(n) = front.localizedName() {
            let s = nsstring_to_owned(&n);
            if !s.trim().is_empty() {
                name = Some(s);
            }
        }
        let path_ns = front
            .bundleURL()
            .or_else(|| front.executableURL())
            .and_then(|url| url.path());
        if let Some(p) = path_ns {
            let s = nsstring_to_owned(&p);
            if !s.trim().is_empty() {
                path = Some(s);
            }
        }
    });
    ClipboardSource {
        app_name: name,
        app_path: path,
    }
}

#[cfg(target_os = "macos")]
unsafe fn nsstring_to_owned(s: &objc2_foundation::NSString) -> String {
    let ptr = s.UTF8String();
    if ptr.is_null() {
        return String::new();
    }
    CStr::from_ptr(ptr).to_string_lossy().into_owned()
}

#[cfg(target_os = "windows")]
fn resolve_clipboard_source_windows() -> ClipboardSource {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;

    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::DataExchange::GetClipboardOwner;
    use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
    use windows::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;

    unsafe {
        let owner = match GetClipboardOwner() {
            Ok(h) => h,
            Err(_) => return ClipboardSource::default(),
        };
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(owner, Some(std::ptr::addr_of_mut!(pid)));
        if pid == 0 || pid == GetCurrentProcessId() {
            return ClipboardSource::default();
        }
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return ClipboardSource::default();
        };
        let mut buf = vec![0u16; 1024];
        let len = GetModuleFileNameExW(Some(handle), None, &mut buf) as usize;
        let _ = CloseHandle(handle);
        if len == 0 {
            return ClipboardSource::default();
        }
        buf.truncate(len);
        let full = OsString::from_wide(&buf).to_string_lossy().into_owned();
        if full.trim().is_empty() {
            return ClipboardSource::default();
        }
        let base = full
            .rsplit('\\')
            .next()
            .or_else(|| full.rsplit('/').next())
            .unwrap_or(&full);
        let base = base
            .trim_end_matches(".exe")
            .trim_end_matches(".EXE")
            .trim();
        let app_name = if base.is_empty() {
            None
        } else {
            Some(base.to_string())
        };
        ClipboardSource {
            app_name,
            app_path: Some(full),
        }
    }
}

fn app_icon_cache_get(path: &str) -> Option<String> {
    APP_ICON_CACHE.lock().unwrap().get(path).cloned()
}

fn app_icon_cache_put(path: String, data_url: String) {
    let mut g = APP_ICON_CACHE.lock().unwrap();
    if g.len() >= APP_ICON_CACHE_CAP && !g.contains_key(&path) {
        g.clear();
    }
    g.insert(path, data_url);
}

#[cfg(target_os = "macos")]
unsafe fn macos_app_icon_data_url_on_main(path: &str) -> Option<String> {
    let workspace = NSWorkspace::sharedWorkspace();
    let ns_path = NSString::from_str(path);
    let icon = workspace.iconForFile(&ns_path);
    let Some(tiff) = icon.TIFFRepresentation() else {
        return None;
    };
    let len = tiff.length();
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len];
    let nn = NonNull::new(buf.as_mut_ptr().cast::<c_void>())?;
    tiff.getBytes_length(nn, len);
    let img = image::load_from_memory_with_format(&buf, MacosImageFormat::Tiff)
        .ok()?
        .into_rgba8();
    const ICON: u32 = 32;
    let thumb = if img.width() == ICON && img.height() == ICON {
        img
    } else {
        imageops::resize(&img, ICON, ICON, imageops::FilterType::Triangle)
    };
    let mut png_buf: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png_buf)
        .write_image(thumb.as_raw(), ICON, ICON, image::ExtendedColorType::Rgba8)
        .ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{b64}"))
}

#[cfg(target_os = "macos")]
fn macos_app_icon_data_url(path: &str) -> Option<String> {
    let path_owned = path.to_string();
    // Tauri IPC 在 macOS 上常落在主线程；若已在主线程再 `exec_sync` 主队列会死锁。
    if unsafe { libc::pthread_main_np() != 0 } {
        unsafe { macos_app_icon_data_url_on_main(&path_owned) }
    } else {
        let mut out: Option<String> = None;
        dispatch::Queue::main().exec_sync(|| {
            out = unsafe { macos_app_icon_data_url_on_main(&path_owned) };
        });
        out
    }
}

#[cfg(target_os = "windows")]
fn windows_app_icon_data_url(path: &str) -> Option<String> {
    let b64 = windows_icons::get_icon_base64_by_path(path).ok()?;
    Some(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
fn get_app_icon_data_url(path: String) -> Option<String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return None;
    }
    if !Path::new(&path).exists() {
        return None;
    }
    if let Some(cached) = app_icon_cache_get(&path) {
        return Some(cached);
    }
    let data_url = {
        #[cfg(target_os = "macos")]
        {
            macos_app_icon_data_url(&path)
        }
        #[cfg(target_os = "windows")]
        {
            windows_app_icon_data_url(&path)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            None::<String>
        }
    }?;
    app_icon_cache_put(path, data_url.clone());
    Some(data_url)
}

#[tauri::command]
fn show_window(window: tauri::Window) {
    show_main_window_with_clipboard_intent(&window.app_handle());
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    hide_main_window(&window.app_handle());
}

/// 前端在落盘剪贴板历史后调用，再真正退出进程（与托盘「退出」流程配合）
#[tauri::command]
fn exit_after_flush<R: Runtime>(app: AppHandle<R>) {
    APP_EXIT_FLUSH_ACK.store(true, Ordering::SeqCst);
    ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
    let _ = app.exit(0);
}

#[tauri::command]
fn update_global_shortcut<R: Runtime>(app: AppHandle<R>, shortcut: String) -> Result<(), String> {
    register_toggle_shortcut(&app, shortcut.trim())
}

#[tauri::command]
async fn start_clipboard_watcher(app: AppHandle) {
    if CLIPBOARD_WATCHER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut last_content = String::new();
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(cb) => cb,
            Err(e) => {
                eprintln!("[kitty-clipboard-history] 剪贴板初始化失败: {e}，监视线程退出");
                CLIPBOARD_WATCHER_STARTED.store(false, Ordering::SeqCst);
                return;
            }
        };

        loop {
            std::thread::sleep(Duration::from_millis(300));

            #[cfg(target_os = "macos")]
            if let Some(file_paths) = read_macos_clipboard_files() {
                let content_hash = hash_file_paths(&file_paths);
                if last_content != content_hash {
                    last_content = content_hash;
                    let src = resolve_clipboard_source();
                    let file_byte_sizes = byte_sizes_for_file_paths(&file_paths);

                    let event = ClipboardEvent {
                        id: uuid::Uuid::new_v4().to_string(),
                        r#type: "file".to_string(),
                        content: summarize_file_paths(&file_paths),
                        content_hash: None,
                        image_byte_size: None,
                        file_byte_sizes,
                        file_paths: Some(file_paths),
                        image_rgba: None,
                        image_width: None,
                        image_height: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        source_app: src.app_name.clone(),
                        source_app_path: src.app_path.clone(),
                        favorited: None,
                    };
                    let _ = app_handle.emit("clipboard-change", &event);
                }
                continue;
            }

            #[cfg(target_os = "windows")]
            if let Some(file_paths) = {
                let src = resolve_clipboard_source();
                read_windows_clipboard_files().map(|p| (p, src))
            } {
                let (file_paths, src) = file_paths;
                let content_hash = hash_file_paths(&file_paths);
                if last_content != content_hash {
                    last_content = content_hash;
                    let file_byte_sizes = byte_sizes_for_file_paths(&file_paths);

                    let event = ClipboardEvent {
                        id: uuid::Uuid::new_v4().to_string(),
                        r#type: "file".to_string(),
                        content: summarize_file_paths(&file_paths),
                        content_hash: None,
                        image_byte_size: None,
                        file_byte_sizes,
                        file_paths: Some(file_paths),
                        image_rgba: None,
                        image_width: None,
                        image_height: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        source_app: src.app_name.clone(),
                        source_app_path: src.app_path.clone(),
                        favorited: None,
                    };
                    let _ = app_handle.emit("clipboard-change", &event);
                }
                continue;
            }

            // 尝试读取文本（先解析来源，再读剪贴板，避免 Windows 上 OpenClipboard 影响 GetClipboardOwner）
            let src_text = resolve_clipboard_source();
            if let Ok(text) = clipboard.get_text() {
                if text.trim().is_empty() {
                    continue;
                }
                if last_content == text {
                    continue;
                }
                last_content = text.clone();

                let event = ClipboardEvent {
                    id: uuid::Uuid::new_v4().to_string(),
                    r#type: "text".to_string(),
                    content: text,
                    content_hash: None,
                    image_byte_size: None,
                    file_byte_sizes: None,
                    file_paths: None,
                    image_rgba: None,
                    image_width: None,
                    image_height: None,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    source_app: src_text.app_name.clone(),
                    source_app_path: src_text.app_path.clone(),
                    favorited: None,
                };
                let _ = app_handle.emit("clipboard-change", &event);
                continue;
            }

            // 尝试读取图片
            let src_image = resolve_clipboard_source();
            if let Ok(image) = clipboard.get_image() {
                let rgba = image.bytes.into_owned();
                let content_hash = hash_image(&rgba, image.width, image.height);
                if last_content == content_hash {
                    continue;
                }
                last_content = content_hash.clone();
                let id = uuid::Uuid::new_v4().to_string();
                let image_byte_size = cache_image(&app_handle, &id, image.width, image.height, &rgba);

                let event = ClipboardEvent {
                    id,
                    r#type: "image".to_string(),
                    content: format!("图片 {}x{}", image.width, image.height),
                    content_hash: Some(content_hash),
                    image_byte_size,
                    file_byte_sizes: None,
                    file_paths: None,
                    image_rgba: None,
                    image_width: Some(image.width),
                    image_height: Some(image.height),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    source_app: src_image.app_name.clone(),
                    source_app_path: src_image.app_path.clone(),
                    favorited: None,
                };
                let _ = app_handle.emit("clipboard-change", &event);
                continue;
            }
        }
    });
}

#[tauri::command]
async fn paste_item(item: ClipboardEvent, window: tauri::Window) {
    // 隐藏窗口后模拟 Ctrl+V 粘贴
    let app = window.app_handle().clone();
    hide_main_window(&app);
    queue_paste_item(app, item);
}

fn queue_paste_item<R: Runtime>(app: AppHandle<R>, item: ClipboardEvent) {
    std::thread::spawn(move || {
        let mut clipboard_ready = false;

        if item.r#type == "file" {
            #[cfg(target_os = "macos")]
            if let Some(paths) = item.file_paths.as_ref() {
                clipboard_ready = write_macos_clipboard_files(paths);
            }

            #[cfg(target_os = "windows")]
            if let Some(paths) = item.file_paths.as_ref() {
                clipboard_ready = write_windows_clipboard_files(paths);
            }
        } else if let Ok(mut clipboard) = arboard::Clipboard::new() {
            if item.r#type == "text" {
                clipboard_ready = clipboard.set_text(&item.content).is_ok();
            } else if item.r#type == "image" {
                if let Some((width, height, bytes)) = load_image_for_paste(&app, &item) {
                    clipboard_ready = clipboard
                        .set_image(arboard::ImageData {
                            width,
                            height,
                            bytes: std::borrow::Cow::Owned(bytes),
                        })
                        .is_ok();
                }
            }
        }

        if clipboard_ready {
            std::thread::sleep(Duration::from_millis(30));
            trigger_paste_shortcut();
        }
    });
}

fn trigger_paste_shortcut() {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::*;
        unsafe {
            keybd_event(VK_CONTROL.0 as u8, 0, KEYEVENTF_EXTENDEDKEY, 0);
            keybd_event(b'V', 0, KEYEVENTF_EXTENDEDKEY, 0);
            keybd_event(b'V', 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
            keybd_event(
                VK_CONTROL.0 as u8,
                0,
                KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                0,
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = simulate_macos_paste();
    }
}

#[cfg(target_os = "macos")]
fn simulate_macos_paste() -> Result<(), ()> {
    const KEY_CODE_V: u16 = 0x09;

    let key_down_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
    let key_down = CGEvent::new_keyboard_event(key_down_source, KEY_CODE_V, true)?;
    key_down.set_flags(CGEventFlags::CGEventFlagCommand);
    key_down.post(CGEventTapLocation::HID);

    let key_up_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
    let key_up = CGEvent::new_keyboard_event(key_up_source, KEY_CODE_V, false)?;
    key_up.set_flags(CGEventFlags::CGEventFlagCommand);
    key_up.post(CGEventTapLocation::HID);

    Ok(())
}

#[cfg(target_os = "macos")]
fn remember_frontmost_application() {
    unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let current_app = NSRunningApplication::currentApplication();
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
            if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
                let _ = app.activateWithOptions(NSApplicationActivationOptions::empty());
            }
        }
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn activate_current_application() {
    unsafe {
        let app = NSRunningApplication::currentApplication();
        let options = NSApplicationActivationOptions::NSApplicationActivateIgnoringOtherApps
            | NSApplicationActivationOptions::NSApplicationActivateAllWindows;
        let _ = app.activateWithOptions(options);
    }
}

fn clipboard_panel_url() -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            "http://localhost:1420/clipboard-panel.html"
                .parse()
                .expect("invalid clipboard-panel dev url"),
        )
    } else {
        tauri::WebviewUrl::App("clipboard-panel.html".into())
    }
}

fn get_or_create_clipboard_panel_window<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<tauri::WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window(CLIPBOARD_PANEL_LABEL) {
        return Ok(window);
    }

    let window = tauri::WebviewWindow::builder(app, CLIPBOARD_PANEL_LABEL, clipboard_panel_url())
        .title("Clipboard History")
        .inner_size(1080.0, 720.0)
        .min_inner_size(720.0, 520.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .center()
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| format!("Create clipboard panel error: {}", e))?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if ALLOW_APP_EXIT.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_close();
            hide_main_window(&app_handle);
        }
    });

    Ok(window)
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "macos")]
    {
        remember_frontmost_application();
        let _ = app.show();
        activate_current_application();
    }

    if let Ok(window) = get_or_create_clipboard_panel_window(app) {
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
}

/// 全局快捷键、托盘「呼出剪贴板」、再次启动应用等路径：显示窗口并通知前端回到「历史列表」而非停留在设置层。
fn show_main_window_with_clipboard_intent<R: Runtime>(app: &AppHandle<R>) {
    show_main_window(app);
    let _ = app.emit("focus-clipboard-panel", ());
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(CLIPBOARD_PANEL_LABEL) {
        let _ = window.hide();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
        restore_previous_application();
    }
}

fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(window) = get_or_create_clipboard_panel_window(app) {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        // 窗口仍「可见」但应用已在后台时，原先会误判为前台并执行隐藏，导致需要连按两次快捷键。
        if visible && focused {
            hide_main_window(app);
        } else {
            show_main_window_with_clipboard_intent(app);
        }
    }
}

fn show_settings_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
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
        Ok(())
    } else {
        Err(tauri::Error::WindowNotFound)
    }
}

#[tauri::command]
fn open_settings_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    show_settings_window(&app).map_err(|e| e.to_string())
}

fn register_toggle_shortcut<R: Runtime>(app: &AppHandle<R>, shortcut: &str) -> Result<(), String> {
    if shortcut.is_empty() {
        return Err("快捷键不能为空".to_string());
    }
    if let Some((selection_shortcut, screenshot_shortcut)) =
        crate::features::translate::current_translate_shortcuts(app)
    {
        if shortcut.eq_ignore_ascii_case(selection_shortcut.trim()) {
            return Err("历史记录面板快捷键不能与划词翻译快捷键相同".to_string());
        }
        if shortcut.eq_ignore_ascii_case(screenshot_shortcut.trim()) {
            return Err("历史记录面板快捷键不能与截图翻译快捷键相同".to_string());
        }
    }

    let global_shortcut = app.global_shortcut();
    let previous_shortcut = CURRENT_GLOBAL_SHORTCUT.lock().unwrap().clone();

    if previous_shortcut.as_deref() == Some(shortcut) {
        return Ok(());
    }

    let parsed_shortcut = shortcut
        .parse::<Shortcut>()
        .map_err(|error| format!("快捷键格式无效：{error}"))?;

    // 先尽力注销同组合键，降低异常退出后插件内部状态与系统不一致导致的「已注册」错误。
    let _ = global_shortcut.unregister(parsed_shortcut.clone());

    global_shortcut
        .on_shortcut(parsed_shortcut, |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            toggle_main_window(app);
        })
        .map_err(|error| format!("快捷键注册失败：{error}"))?;

    if let Some(previous_shortcut) = previous_shortcut {
        if let Ok(previous_shortcut) = previous_shortcut.parse::<Shortcut>() {
            let _ = global_shortcut.unregister(previous_shortcut);
        }
    }

    *CURRENT_GLOBAL_SHORTCUT.lock().unwrap() = Some(shortcut.to_string());
    Ok(())
}

fn hash_image(bytes: &[u8], width: usize, height: usize) -> String {
    let mut hasher = DefaultHasher::new();
    width.hash(&mut hasher);
    height.hash(&mut hasher);
    bytes.hash(&mut hasher);
    format!("image:{:x}", hasher.finish())
}

fn sanitize_clipboard_image_id(id: &str) -> Option<&str> {
    if id.is_empty() || id.len() > 200 {
        return None;
    }
    if id.chars().any(|c| matches!(c, '/' | '\\' | ':' | '\0')) {
        return None;
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(id)
}

fn clipboard_images_dir<R: Runtime>(app: &AppHandle<R>) -> Result<std::path::PathBuf, std::io::Error> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let dir = base.join("clipboard_images");
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn clipboard_preview_path<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<std::path::PathBuf> {
    let safe_id = sanitize_clipboard_image_id(id)?;
    let dir = clipboard_images_dir(app).ok()?;
    Some(dir.join(format!("{safe_id}.preview.png")))
}

fn rgba_to_png_bytes(width: usize, height: usize, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut buf, width as u32, height as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(buf)
}

fn rgba_to_preview_png_bytes(
    width: usize,
    height: usize,
    rgba: &[u8],
    max_edge: u32,
) -> Option<Vec<u8>> {
    let w = width as u32;
    let h = height as u32;
    let img: RgbaImage = ImageBuffer::from_raw(w, h, rgba.to_vec())?;
    let scale = (max_edge as f64 / w.max(h) as f64).min(1.0);
    let nw = ((w as f64 * scale).round() as u32).max(1);
    let nh = ((h as f64 * scale).round() as u32).max(1);

    let thumb = if nw == w && nh == h {
        img
    } else {
        imageops::resize(&img, nw, nh, imageops::FilterType::Triangle)
    };

    let mut png_buf: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png_buf)
        .write_image(thumb.as_raw(), nw, nh, image::ExtendedColorType::Rgba8)
        .ok()?;
    Some(png_buf)
}

fn persist_clipboard_preview<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    width: usize,
    height: usize,
    bytes: &[u8],
) {
    let Some(path) = clipboard_preview_path(app, id) else {
        return;
    };
    let Some(png) = rgba_to_preview_png_bytes(width, height, bytes, PREVIEW_MAX_EDGE) else {
        return;
    };
    let _ = fs::write(path, png);
}

fn persist_clipboard_image<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    width: usize,
    height: usize,
    bytes: &[u8],
) -> Option<usize> {
    let Some(safe_id) = sanitize_clipboard_image_id(id) else {
        return None;
    };
    let Ok(dir) = clipboard_images_dir(app) else {
        return None;
    };
    let Some(png) = rgba_to_png_bytes(width, height, bytes) else {
        return None;
    };
    let path = dir.join(format!("{safe_id}.kchi"));
    let mut buf = Vec::with_capacity(16 + png.len());
    buf.extend_from_slice(CLIPBOARD_IMAGE_MAGIC_PNG);
    buf.extend_from_slice(&(width as u32).to_le_bytes());
    buf.extend_from_slice(&(height as u32).to_le_bytes());
    buf.extend_from_slice(&(png.len() as u32).to_le_bytes());
    buf.extend_from_slice(&png);
    let _ = fs::write(path, buf);
    Some(png.len())
}

fn load_clipboard_image_from_disk<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
) -> Option<CachedImage> {
    let safe_id = sanitize_clipboard_image_id(id)?;
    let dir = clipboard_images_dir(app).ok()?;
    let path = dir.join(format!("{safe_id}.kchi"));
    let mut f = fs::File::open(path).ok()?;
    let mut raw = Vec::new();
    f.read_to_end(&mut raw).ok()?;
    if raw.len() < 12 {
        return None;
    }
    let magic = raw.get(0..4)?;
    if magic == CLIPBOARD_IMAGE_MAGIC_PNG {
        let width = u32::from_le_bytes(raw.get(4..8)?.try_into().ok()?) as usize;
        let height = u32::from_le_bytes(raw.get(8..12)?.try_into().ok()?) as usize;
        let png_len = u32::from_le_bytes(raw.get(12..16)?.try_into().ok()?) as usize;
        let end = 16usize.checked_add(png_len)?;
        let png = raw.get(16..end)?;
        let rgba = image::load_from_memory(png).ok()?.into_rgba8();
        let (w, h) = rgba.dimensions();
        if w as usize != width || h as usize != height {
            return None;
        }
        return Some(CachedImage {
            id: id.to_string(),
            width,
            height,
            bytes: rgba.into_raw(),
        });
    }
    if magic != CLIPBOARD_IMAGE_MAGIC {
        return None;
    }
    let width = u32::from_le_bytes(raw.get(4..8)?.try_into().ok()?) as usize;
    let height = u32::from_le_bytes(raw.get(8..12)?.try_into().ok()?) as usize;
    let rgba = raw.get(12..)?.to_vec();
    let expected = width.checked_mul(height)?.checked_mul(4)?;
    if rgba.len() != expected {
        return None;
    }
    Some(CachedImage {
        id: id.to_string(),
        width,
        height,
        bytes: rgba,
    })
}

fn put_image_in_memory_cache(id: &str, width: usize, height: usize, bytes: &[u8]) {
    let mut cache = IMAGE_CACHE.lock().unwrap();
    cache.retain(|entry| entry.id != id);
    cache.push(CachedImage {
        id: id.to_string(),
        width,
        height,
        bytes: bytes.to_vec(),
    });

    while cache.len() > MAX_CACHED_IMAGES
        || cache.iter().map(|entry| entry.bytes.len()).sum::<usize>() > MAX_CACHED_IMAGE_BYTES
    {
        cache.remove(0);
    }
}

fn prune_image_memory_cache(keep: &HashSet<String>) {
    let mut cache = IMAGE_CACHE.lock().unwrap();
    cache.retain(|entry| keep.contains(&entry.id));
}

fn cache_image<R: Runtime>(app: &AppHandle<R>, id: &str, width: usize, height: usize, bytes: &[u8]) -> Option<usize> {
    let byte_size = persist_clipboard_image(app, id, width, height, bytes);
    persist_clipboard_preview(app, id, width, height, bytes);
    if bytes.len() <= MAX_IN_MEMORY_RGBA_BYTES {
        put_image_in_memory_cache(id, width, height, bytes);
    }
    byte_size
}

fn resolve_image_entry<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<CachedImage> {
    {
        let cache = IMAGE_CACHE.lock().unwrap();
        if let Some(e) = cache.iter().find(|e| e.id == id) {
            return Some(e.clone());
        }
    }
    let loaded = load_clipboard_image_from_disk(app, id)?;
    if loaded.bytes.len() <= MAX_IN_MEMORY_RGBA_BYTES {
        put_image_in_memory_cache(id, loaded.width, loaded.height, &loaded.bytes);
    }
    Some(loaded)
}

/// 返回图片预览文件路径；默认优先命中已持久化的小图，缺失时再从原图生成
#[tauri::command]
fn get_image_preview_asset_path(app: AppHandle, id: String, max_edge: Option<u32>) -> Option<String> {
    let max_edge = max_edge.unwrap_or(PREVIEW_MAX_EDGE);
    if max_edge == PREVIEW_MAX_EDGE {
        if let Some(path) = clipboard_preview_path(&app, &id) {
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    let entry = resolve_image_entry(&app, &id)?;

    let png = rgba_to_preview_png_bytes(entry.width, entry.height, &entry.bytes, max_edge)?;
    let path = clipboard_preview_path(&app, &id)?;
    if fs::write(&path, png).is_ok() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

#[tauri::command]
fn prune_clipboard_image_store(app: AppHandle, keep_ids: Vec<String>) -> Result<(), String> {
    let dir = clipboard_images_dir(&app).map_err(|e| e.to_string())?;
    let keep: HashSet<String> = keep_ids.into_iter().collect();
    prune_image_memory_cache(&keep);
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".preview.png") {
            let stem = name.strip_suffix(".preview.png").unwrap_or("");
            if !keep.contains(stem) {
                let _ = fs::remove_file(&path);
            }
            continue;
        }
        if !name.ends_with(".kchi") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !keep.contains(stem) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

fn load_image_for_paste<R: Runtime>(
    app: &AppHandle<R>,
    item: &ClipboardEvent,
) -> Option<(usize, usize, Vec<u8>)> {
    if let Some(entry) = resolve_image_entry(app, &item.id) {
        return Some((entry.width, entry.height, entry.bytes));
    }

    match (item.image_width, item.image_height, item.image_rgba.clone()) {
        (Some(width), Some(height), Some(bytes)) => Some((width, height, bytes)),
        _ => None,
    }
}

fn hash_file_paths(paths: &[String]) -> String {
    let mut hasher = DefaultHasher::new();
    paths.hash(&mut hasher);
    format!("file:{:x}", hasher.finish())
}

fn summarize_file_paths(paths: &[String]) -> String {
    if paths.is_empty() {
        return "文件".to_string();
    }

    if paths.len() == 1 {
        return Path::new(&paths[0])
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| paths[0].clone());
    }

    format!("{} 个文件", paths.len())
}

fn byte_sizes_for_file_paths(paths: &[String]) -> Option<Vec<u64>> {
    if paths.is_empty() {
        return None;
    }
    Some(
        paths
            .iter()
            .map(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0))
            .collect(),
    )
}

#[cfg(target_os = "macos")]
fn read_macos_clipboard_files() -> Option<Vec<String>> {
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        let url_class = {
            let cls: *const AnyClass = NSURL::class();
            let cls = cls as *mut AnyObject;
            Retained::retain(cls).unwrap()
        };
        let class_array = NSArray::from_vec(vec![url_class]);
        let objects = pasteboard.readObjectsForClasses_options(&class_array, None)?;

        let mut file_paths = Vec::new();
        for index in 0..objects.len() {
            let Some(object) = objects.get(index) else {
                continue;
            };
            let url = &*((object as *const AnyObject).cast::<NSURL>());
            if !url.isFileURL() {
                continue;
            }

            if let Some(path) = url.path() {
                file_paths.push(path.to_string());
            }
        }

        if file_paths.is_empty() {
            None
        } else {
            Some(file_paths)
        }
    }
}

#[cfg(target_os = "macos")]
fn write_macos_clipboard_files(paths: &[String]) -> bool {
    if paths.is_empty() {
        return false;
    }

    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        let _ = pasteboard.clearContents();

        let urls = paths
            .iter()
            .map(|path| NSURL::fileURLWithPath(&NSString::from_str(path)))
            .map(ProtocolObject::from_retained)
            .collect::<Vec<_>>();
        let objects = NSArray::from_vec(urls);

        pasteboard.writeObjects(&objects)
    }
}

// ── Windows 文件剪贴板支持 ──────────────────────────────────────────

#[cfg(target_os = "windows")]
fn read_windows_clipboard_files() -> Option<Vec<String>> {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };

    // CF_HDROP = 15 是 Windows 预定义的文件拖放剪贴板格式
    const CF_HDROP: u32 = 15;

    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP).is_err() {
            return None;
        }

        if OpenClipboard(None).is_err() {
            return None;
        }

        let result = (|| -> Option<Vec<String>> {
            let handle = GetClipboardData(CF_HDROP).ok()?;

            let file_count = DragQueryFileW(handle, 0xFFFFFFFF, windows::core::PCWSTR::null(), 0);
            if file_count == 0 {
                return None;
            }

            let mut paths = Vec::new();
            for i in 0..file_count {
                let len = DragQueryFileW(handle, i, windows::core::PCWSTR::null(), 0);
                if len == 0 {
                    continue;
                }
                let mut buf = vec![0u16; (len as usize) + 1];
                DragQueryFileW(handle, i, windows::core::PCWSTR(buf.as_mut_ptr()), len + 1);
                let path = String::from_utf16_lossy(&buf[..len as usize]);
                paths.push(path);
            }

            if paths.is_empty() {
                None
            } else {
                Some(paths)
            }
        })();

        let _ = CloseClipboard();
        result
    }
}

#[cfg(target_os = "windows")]
fn write_windows_clipboard_files(paths: &[String]) -> bool {
    use windows::Win32::Foundation::{HANDLE, POINT};
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    const CF_HDROP: u32 = 15;

    if paths.is_empty() {
        return false;
    }

    unsafe {
        if OpenClipboard(None).is_err() {
            return false;
        }

        let result = (|| -> bool {
            let _ = EmptyClipboard();

            // DROPFILES 头 + 文件路径列表
            let wide_paths: Vec<Vec<u16>> = paths
                .iter()
                .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
                .collect();

            let all_paths_bytes: usize = wide_paths.iter().map(|p| p.len() * 2).sum();
            let dropfiles_size = std::mem::size_of::<DROPFILES>();
            let total_size = dropfiles_size + all_paths_bytes + 2; // +2 for final null terminator

            let hglobal = match GlobalAlloc(GMEM_MOVEABLE, total_size) {
                Ok(h) => h,
                Err(_) => return false,
            };

            let ptr = GlobalLock(hglobal);
            if ptr.is_null() {
                return false;
            }

            // 写入 DROPFILES 头
            let dropfiles = ptr as *mut DROPFILES;
            std::ptr::write(
                dropfiles,
                DROPFILES {
                    pFiles: dropfiles_size as u32,
                    pt: POINT { x: 0, y: 0 },
                    fNC: 0,
                    fWide: 1,
                },
            );

            // 写入文件路径（紧跟 DROPFILES 头之后）
            let mut offset = dropfiles_size;
            for wide_path in &wide_paths {
                let src = wide_path.as_ptr();
                let dst = (ptr as *mut u8).add(offset) as *mut u16;
                std::ptr::copy_nonoverlapping(src, dst, wide_path.len());
                offset += wide_path.len() * 2;
            }
            // 末尾追加额外 null 终止符
            let final_null = (ptr as *mut u8).add(offset) as *mut u16;
            std::ptr::write(final_null, 0);

            let _ = GlobalUnlock(hglobal);

            // SetClipboardData 接管 hglobal 的所有权，成功后不需要释放
            SetClipboardData(CF_HDROP, Some(HANDLE(hglobal.0))).is_ok()
        })();

        let _ = CloseClipboard();
        result
    }
}

// DROPFILES 结构体 (shlobj_core.h)
#[cfg(target_os = "windows")]
#[allow(non_snake_case)]
#[repr(C)]
struct DROPFILES {
    pFiles: u32,
    pt: windows::Win32::Foundation::POINT,
    fNC: i32,
    fWide: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
extern "system" {
    fn DragQueryFileW(
        hDrop: windows::Win32::Foundation::HANDLE,
        iFile: u32,
        lpszFile: windows::core::PCWSTR,
        cch: u32,
    ) -> u32;
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = get_or_create_clipboard_panel_window(app)?;
    let _ = window.hide();

    if let Err(error) = register_toggle_shortcut(app, DEFAULT_GLOBAL_SHORTCUT) {
        eprintln!("[kitty-clipboard-history] {error}");
        let _ = app.emit("global-shortcut-register-failed", error);
    }

    Ok(())
}

pub fn show_clipboard_panel<R: Runtime>(app: &AppHandle<R>) {
    show_main_window_with_clipboard_intent(app);
}

pub fn toggle_clipboard_panel<R: Runtime>(app: &AppHandle<R>) {
    toggle_main_window(app);
}

pub fn request_flush_then_exit<R: Runtime>(app: &AppHandle<R>) {
    APP_EXIT_FLUSH_ACK.store(false, Ordering::SeqCst);
    if let Err(error) = app.emit("app-exit-requested", ()) {
        eprintln!(
            "[kitty-clipboard-history] 退出事件发送失败: {error}，将直接退出（可能未落盘）"
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
                "[kitty-clipboard-history] 前端未在 15s 内完成退出落盘流程，将强制退出（数据可能未完全保存）"
            );
            ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
            let _ = app_for_deadline.exit(0);
        });
    }
}

pub fn consume_allow_exit() -> bool {
    ALLOW_APP_EXIT.swap(false, Ordering::SeqCst)
}

pub fn current_clipboard_shortcut() -> Option<String> {
    CURRENT_GLOBAL_SHORTCUT
        .lock()
        .ok()
        .and_then(|shortcut| shortcut.clone())
}

#[tauri::command]
pub fn window_show_clipboard_panel(window: tauri::Window) {
    show_window(window)
}

#[tauri::command]
pub fn window_hide_clipboard_panel(window: tauri::Window) {
    hide_window(window)
}

#[tauri::command]
pub fn clipboard_exit_after_flush(app: AppHandle) {
    exit_after_flush(app)
}

#[tauri::command]
pub fn clipboard_update_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    update_global_shortcut(app, shortcut)
}

#[tauri::command]
pub async fn clipboard_start_watcher(app: AppHandle) {
    start_clipboard_watcher(app).await
}

#[tauri::command]
pub async fn clipboard_paste_item(item: ClipboardEvent, window: tauri::Window) {
    paste_item(item, window).await
}

#[tauri::command]
pub fn clipboard_get_image_preview_asset_path(
    app: AppHandle,
    id: String,
    max_edge: Option<u32>,
) -> Option<String> {
    get_image_preview_asset_path(app, id, max_edge)
}

#[tauri::command]
pub fn clipboard_prune_image_store(app: AppHandle, keep_ids: Vec<String>) -> Result<(), String> {
    prune_clipboard_image_store(app, keep_ids)
}

#[tauri::command]
pub fn clipboard_get_app_icon_data_url(path: String) -> Option<String> {
    get_app_icon_data_url(path)
}

/// 左键：`show_menu_on_left_click(false)` 时走自定义逻辑（呼出剪贴板）；右键：由 tray-icon 在 Windows / macOS 上弹出已挂载的菜单。
fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_item = MenuItemBuilder::with_id(TRAY_TOGGLE_ID, "呼出 / 隐藏剪贴板").build(app)?;
    let settings_item = MenuItemBuilder::with_id(TRAY_SETTINGS_ID, "打开设置…").build(app)?;
    let quit_item = MenuItemBuilder::with_id(TRAY_QUIT_ID, "退出").build(app)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&toggle_item, &settings_item, &separator, &quit_item])?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Kitty 剪切板 · 左键呼出历史，右键打开菜单")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_TOGGLE_ID => toggle_main_window(app),
            TRAY_SETTINGS_ID => {
                if let Err(error) = show_settings_window(app) {
                    eprintln!("[kitty-clipboard-history] 打开设置窗口失败: {error}");
                }
            }
            TRAY_QUIT_ID => {
                APP_EXIT_FLUSH_ACK.store(false, Ordering::SeqCst);
                if let Err(error) = app.emit("app-exit-requested", ()) {
                    eprintln!(
                        "[kitty-clipboard-history] 退出事件发送失败: {error}，将直接退出（可能未落盘）"
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
                            "[kitty-clipboard-history] 前端未在 15s 内完成退出落盘流程，将强制退出（数据可能未完全保存）"
                        );
                        ALLOW_APP_EXIT.store(true, Ordering::SeqCst);
                        let _ = app_for_deadline.exit(0);
                    });
                }
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
                toggle_main_window(&tray.app_handle().clone());
            }
        });

    #[cfg(target_os = "macos")]
    {
        tray_builder = tray_builder
            .icon(build_macos_tray_icon()?)
            .icon_as_template(false);
    }

    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon().cloned() {
            tray_builder = tray_builder.icon(icon);
        }
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn build_macos_tray_icon() -> tauri::Result<Image<'static>> {
    let icon = image::load_from_memory_with_format(include_bytes!("../../../icons/logo.png"), MacosImageFormat::Png)
        .map_err(|error| std::io::Error::other(format!("加载 macOS 托盘图标失败: {error}")))?
        .into_rgba8();
    let (width, height) = icon.dimensions();

    Ok(Image::new_owned(icon.into_raw(), width, height))
}

/// 仅托盘常驻：无 Dock（macOS）、无任务栏程序图标（Windows）；呼出窗口靠快捷键与托盘菜单。
fn ensure_tray_only_app_chrome<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app.tray_by_id(TRAY_ID).is_none() {
        build_tray(app)?;
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_visible(true)?;
    }

    #[cfg(target_os = "windows")]
    {
        for label in ["main", "settings"] {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 桌面端：保证全局仅一个进程；再次启动（快捷方式、Spotlight 等）时聚焦已有窗口，避免多实例。
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window_with_clipboard_intent(&app);
        }));
    }

    builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            start_clipboard_watcher,
            show_window,
            hide_window,
            open_settings_window,
            exit_after_flush,
            paste_item,
            update_global_shortcut,
            get_image_preview_asset_path,
            prune_clipboard_image_store,
            get_app_icon_data_url,
        ])
        .setup(|app| {
            ensure_tray_only_app_chrome(&app.handle())?;

            if let Err(error) = register_toggle_shortcut(&app.handle(), DEFAULT_GLOBAL_SHORTCUT) {
                eprintln!("[kitty-clipboard-history] {error}");
                eprintln!(
                    "[kitty-clipboard-history] 应用将继续运行；请在设置中更换全局快捷键，或关闭占用 {} 的其他程序/实例。",
                    DEFAULT_GLOBAL_SHORTCUT
                );
                let _ = app
                    .handle()
                    .emit("global-shortcut-register-failed", error);
            }

            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        if ALLOW_APP_EXIT.load(Ordering::SeqCst) {
                            return;
                        }
                        api.prevent_close();
                        hide_main_window(&app_handle);
                    }
                });

                #[cfg(debug_assertions)]
                {
                    #[cfg(target_os = "macos")]
                    {
                        let _ = app.show();
                        activate_current_application();
                    }

                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = app.handle().emit("focus-clipboard-panel", ());
                }

                #[cfg(not(debug_assertions))]
                // Release 版本保持后台工具的交互方式，启动后默认隐藏。
                let _ = window.hide();
            }

            if let Some(settings_win) = app.get_webview_window("settings") {
                let settings_handle = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = settings_handle.hide();
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if ALLOW_APP_EXIT.swap(false, Ordering::SeqCst) {
                    return;
                }
                api.prevent_exit();
            }
        });
}
