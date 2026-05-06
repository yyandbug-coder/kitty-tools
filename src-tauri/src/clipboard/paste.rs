use std::time::Duration;
use tauri::{Manager, Runtime};

use super::watcher::ClipboardEvent;

use super::image_cache;

#[cfg(target_os = "macos")]
use objc2::ClassType;
#[cfg(target_os = "macos")]
use objc2::runtime::ProtocolObject;
#[cfg(target_os = "macos")]
use objc2_foundation::{NSArray, NSString, NSURL};
#[cfg(target_os = "macos")]
use objc2_app_kit::NSPasteboard;

/// 把任意文本写入系统剪贴板。前端 `navigator.clipboard.writeText` 在窗口失焦或无权限时会被拒绝，
/// 自动复制译文等场景需要此命令做兜底；走 OS 原生 API（arboard）不依赖 Web 权限。
#[tauri::command]
pub async fn write_text_to_clipboard(text: String) -> Result<(), String> {
    // arboard 句柄申请/写入均很快（毫秒级），直接在 tokio worker 上同步执行可接受。
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paste_item(item: ClipboardEvent, app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("clipboard-popup") {
        let _: Result<(), _> = w.hide();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = app.hide();
    }
    queue_paste_item(app, item);
}

fn queue_paste_item<R: Runtime>(app: tauri::AppHandle<R>, item: ClipboardEvent) {
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
                if let Some((width, height, bytes)) = image_cache::load_image_for_paste(&app, &item) {
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
    unsafe {
        // 注入 Ctrl+V 前先释放可能残留的全局快捷键修饰键（Ctrl+Shift+V 等），
        // 避免目标应用收到 Ctrl+Shift+V（部分应用为「无格式粘贴」或不响应）。
        crate::win_input::release_all_modifiers();
        // 给系统消息泵处理修饰键释放的时间，避免随后注入的 Ctrl 与残留 Shift 状态合并。
        std::thread::sleep(Duration::from_millis(30));
        crate::win_input::inject_ctrl_v();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = crate::mac_input::inject_cmd_v();
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn read_macos_clipboard_files() -> Option<Vec<String>> {
    unsafe {
        let pasteboard = NSPasteboard::generalPasteboard();
        let url_class = {
            let cls: *const objc2::runtime::AnyClass = NSURL::class();
            let cls = cls as *mut objc2::runtime::AnyObject;
            objc2::rc::Retained::retain(cls).unwrap()
        };
        let class_array = NSArray::from_vec(vec![url_class]);
        let objects = pasteboard.readObjectsForClasses_options(&class_array, None)?;

        let mut file_paths = Vec::new();
        for index in 0..objects.len() {
            let Some(object) = objects.get(index) else {
                continue;
            };
            let url = &*((object as *const objc2::runtime::AnyObject).cast::<NSURL>());
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

#[cfg(target_os = "windows")]
pub(crate) fn read_windows_clipboard_files() -> Option<Vec<String>> {
    use windows::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
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
            if paths.is_empty() { None } else { Some(paths) }
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
            let wide_paths: Vec<Vec<u16>> = paths
                .iter()
                .map(|p| p.encode_utf16().chain(std::iter::once(0)).collect())
                .collect();
            let all_paths_bytes: usize = wide_paths.iter().map(|p| p.len() * 2).sum();
            let dropfiles_size = std::mem::size_of::<DROPFILES>();
            let total_size = dropfiles_size + all_paths_bytes + 2;
            let hglobal = match GlobalAlloc(GMEM_MOVEABLE, total_size) {
                Ok(h) => h,
                Err(_) => return false,
            };
            let ptr = GlobalLock(hglobal);
            if ptr.is_null() {
                return false;
            }
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
            let mut offset = dropfiles_size;
            for wide_path in &wide_paths {
                let src = wide_path.as_ptr();
                let dst = (ptr as *mut u8).add(offset) as *mut u16;
                std::ptr::copy_nonoverlapping(src, dst, wide_path.len());
                offset += wide_path.len() * 2;
            }
            let final_null = (ptr as *mut u8).add(offset) as *mut u16;
            std::ptr::write(final_null, 0);
            let _ = GlobalUnlock(hglobal);
            SetClipboardData(CF_HDROP, Some(HANDLE(hglobal.0))).is_ok()
        })();
        let _ = CloseClipboard();
        result
    }
}

#[cfg(target_os = "windows")]
#[allow(non_snake_case, clippy::upper_case_acronyms)]
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
