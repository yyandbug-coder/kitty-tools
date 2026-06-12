use std::time::Duration;

/// 划词检测轮询参数。
#[derive(Clone, Copy)]
pub struct SelectionOptions {
    pub max_wait: Duration,
    pub poll_interval: Duration,
    /// 最短轮询次数（避免模拟复制尚未完成就提前退出）。
    pub min_polls: u32,
    /// 连续空剪贴板达到此次数且已超过 `min_polls` 时提前结束。
    pub early_exit_empty_polls: u32,
}

impl Default for SelectionOptions {
    fn default() -> Self {
        Self {
            max_wait: Duration::from_millis(800),
            poll_interval: Duration::from_millis(40),
            min_polls: 3,
            early_exit_empty_polls: 12,
        }
    }
}

impl SelectionOptions {
    /// 划词快捷键：略短于默认超时，无选区时提前结束以减少空等。
    pub fn for_hotkey() -> Self {
        Self {
            max_wait: Duration::from_millis(600),
            poll_interval: Duration::from_millis(30),
            min_polls: 3,
            early_exit_empty_polls: 6,
        }
    }
}

pub fn get_selected_text_for_hotkey() -> Result<String, String> {
    get_selected_text_with_options(SelectionOptions::for_hotkey())
}

pub fn get_selected_text_with_options(opts: SelectionOptions) -> Result<String, String> {
    get_selected_text_with_options_impl(opts)
}

fn poll_clipboard_text<F>(mut read_text: F, opts: SelectionOptions) -> Option<String>
where
    F: FnMut() -> Option<String>,
{
    let max_iters = ((opts.max_wait.as_millis() + opts.poll_interval.as_millis() - 1)
        / opts.poll_interval.as_millis())
        .max(1) as u32;
    let mut empty_streak = 0u32;
    for i in 0..max_iters {
        std::thread::sleep(opts.poll_interval);
        match read_text() {
            Some(t) if !t.trim().is_empty() => return Some(t.trim().to_string()),
            _ => empty_streak += 1,
        }
        if i + 1 >= opts.min_polls && empty_streak >= opts.early_exit_empty_polls {
            break;
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn get_selected_text_with_options_impl(opts: SelectionOptions) -> Result<String, String> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};

    const CF_UNICODETEXT: u32 = 13;

    unsafe fn get_clipboard_text() -> Option<String> {
        if OpenClipboard(None).is_err() {
            return None;
        }

        let result = match GetClipboardData(CF_UNICODETEXT) {
            Ok(handle) if !handle.is_invalid() => {
                let hglobal = HGLOBAL(handle.0);
                let ptr = GlobalLock(hglobal);
                if ptr.is_null() {
                    None
                } else {
                    let size = GlobalSize(hglobal);
                    // CF_UNICODETEXT 应为 UTF-16；无 NUL 终止或损坏数据时须用 GlobalSize 限界，避免越界读导致闪退。
                    if size < 2 {
                        let _ = GlobalUnlock(hglobal);
                        None
                    } else {
                        let wchar_cap = size / 2;
                        let start = ptr as *const u16;
                        let mut len = 0usize;
                        while len < wchar_cap && *start.add(len) != 0 {
                            len += 1;
                        }
                        let wide = std::slice::from_raw_parts(start, len).to_vec();
                        let _ = GlobalUnlock(hglobal);
                        String::from_utf16(&wide).ok()
                    }
                }
            }
            _ => None,
        };

        let _ = CloseClipboard();
        result
    }

    /// Save current clipboard text so we can restore it after reading the selection.
    /// Save current clipboard data for all known formats so we can restore them later.
    unsafe fn save_clipboard_all() -> Vec<(u32, Vec<u8>)> {
        use windows::Win32::System::DataExchange::EnumClipboardFormats;

        if OpenClipboard(None).is_err() {
            return Vec::new();
        }
        let mut saved = Vec::new();
        let mut fmt: u32 = 0;
        loop {
            fmt = EnumClipboardFormats(fmt);
            if fmt == 0 {
                break;
            }
            if let Ok(handle) = GetClipboardData(fmt) {
                if handle.is_invalid() {
                    continue;
                }
                let hglobal = HGLOBAL(handle.0);
                let ptr = GlobalLock(hglobal);
                if ptr.is_null() {
                    continue;
                }
                let size = GlobalSize(hglobal);
                if size == 0 {
                    let _ = GlobalUnlock(hglobal);
                    continue;
                }
                let data = std::slice::from_raw_parts(ptr as *const u8, size).to_vec();
                let _ = GlobalUnlock(hglobal);
                saved.push((fmt, data));
            }
        }
        let _ = CloseClipboard();
        saved
    }

    /// Restore previously saved clipboard data for all formats.
    unsafe fn restore_clipboard_all(saved: &[(u32, Vec<u8>)]) {
        use windows::Win32::Foundation::HANDLE;

        if saved.is_empty() {
            return;
        }
        if OpenClipboard(None).is_err() {
            return;
        }
        let _ = EmptyClipboard();
        for (fmt, data) in saved {
            let size = data.len();
            let h = match GlobalAlloc(GMEM_MOVEABLE, size) {
                Ok(h) => h,
                Err(_) => continue,
            };
            let ptr = GlobalLock(h);
            if ptr.is_null() {
                continue;
            }
            std::ptr::copy_nonoverlapping(data.as_ptr(), ptr as *mut u8, size);
            let _ = GlobalUnlock(h);
            let _ = SetClipboardData(*fmt, Some(HANDLE(h.0)));
        }
        let _ = CloseClipboard();
    }

    // Step 1: Save the current clipboard content (all formats) so we can restore it later.
    let saved_clipboard = unsafe { save_clipboard_all() };

    // Step 2: 释放可能仍按下的全局快捷键修饰键（含 Win/Alt/Shift/Ctrl 左右键）。
    unsafe { crate::win_input::release_all_modifiers() };

    // Step 3: Wait for the modifier release to be processed by the system.
    std::thread::sleep(std::time::Duration::from_millis(100));

    // Step 4: Clear the clipboard so we can reliably detect new content.
    unsafe {
        if OpenClipboard(None).is_ok() {
            let _ = EmptyClipboard();
            let _ = CloseClipboard();
        }
    }

    // Step 5: Simulate Ctrl+C to copy whatever text is currently selected.
    unsafe { crate::win_input::inject_ctrl_c() };

    // Step 6: 轮询剪贴板等待新文本（默认最长 ~800ms，无选区时提前退出）。
    let new_text = poll_clipboard_text(|| unsafe { get_clipboard_text() }, opts);

    // Step 7: Restore the original clipboard content (all formats).
    unsafe { restore_clipboard_all(&saved_clipboard) };

    match new_text {
        Some(t) => Ok(t),
        None => Err("No text selected".to_string()),
    }
}

#[cfg(target_os = "macos")]
fn get_selected_text_with_options_impl(opts: SelectionOptions) -> Result<String, String> {
    use std::process::Command;
    use std::thread;
    use std::time::Duration;

    use objc2::class;
    use objc2::msg_send;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSPasteboard;
    use objc2_foundation::{NSData, NSString};

    /// 与 NSPasteboardItem 通信用：保存某条 item 上每种 type 的原始 NSData 字节。
    /// 还原时按相同顺序重建 NSPasteboardItem，最大程度保留图片/文件/RTF/HTML 等富格式。
    struct SavedItem {
        types_and_data: Vec<(String, Vec<u8>)>,
    }

    unsafe fn ns_string(value: &str) -> Retained<NSString> {
        NSString::from_str(value)
    }

    unsafe fn ns_string_to_string(s: *const AnyObject) -> Option<String> {
        if s.is_null() {
            return None;
        }
        let s = s as *const NSString;
        Some((*s).to_string())
    }

    unsafe fn save_pasteboard_all() -> Vec<SavedItem> {
        let pb = NSPasteboard::generalPasteboard();
        // -[NSPasteboard pasteboardItems] 返回 NSArray<NSPasteboardItem>* 或 nil
        let items: *mut AnyObject = msg_send![&*pb, pasteboardItems];
        if items.is_null() {
            return Vec::new();
        }
        let count: usize = msg_send![items, count];
        let mut saved = Vec::with_capacity(count);
        for i in 0..count {
            let item: *mut AnyObject = msg_send![items, objectAtIndex: i];
            if item.is_null() {
                continue;
            }
            // -[NSPasteboardItem types] -> NSArray<NSPasteboardType>* (实质 NSString*)
            let types: *mut AnyObject = msg_send![item, types];
            if types.is_null() {
                continue;
            }
            let type_count: usize = msg_send![types, count];
            let mut bag: Vec<(String, Vec<u8>)> = Vec::with_capacity(type_count);
            for j in 0..type_count {
                let type_obj: *mut AnyObject = msg_send![types, objectAtIndex: j];
                let Some(type_str) = ns_string_to_string(type_obj) else {
                    continue;
                };
                // -[NSPasteboardItem dataForType:type] -> NSData* | nil
                let data_obj: *mut AnyObject = msg_send![item, dataForType: type_obj];
                if data_obj.is_null() {
                    continue;
                }
                let data_ns = data_obj as *const NSData;
                let len: usize = (*data_ns).length();
                let bytes_ptr: *const u8 = (*data_ns).bytes().as_ptr() as *const u8;
                if bytes_ptr.is_null() || len == 0 {
                    bag.push((type_str, Vec::new()));
                    continue;
                }
                let slice = std::slice::from_raw_parts(bytes_ptr, len);
                bag.push((type_str, slice.to_vec()));
            }
            if !bag.is_empty() {
                saved.push(SavedItem { types_and_data: bag });
            }
        }
        saved
    }

    unsafe fn clear_pasteboard() {
        let pb = NSPasteboard::generalPasteboard();
        let _: i64 = msg_send![&*pb, clearContents];
    }

    unsafe fn restore_pasteboard_all(saved: &[SavedItem]) {
        if saved.is_empty() {
            return;
        }
        let pb = NSPasteboard::generalPasteboard();
        let _: i64 = msg_send![&*pb, clearContents];

        let cls = class!(NSPasteboardItem);
        let mut new_items: Vec<Retained<AnyObject>> = Vec::with_capacity(saved.len());
        for s in saved {
            let alloc: *mut AnyObject = msg_send![cls, alloc];
            let item_raw: *mut AnyObject = msg_send![alloc, init];
            if item_raw.is_null() {
                continue;
            }
            let Some(item) = Retained::from_raw(item_raw) else {
                continue;
            };
            for (type_str, bytes) in &s.types_and_data {
                if bytes.is_empty() {
                    continue;
                }
                let ns_type = ns_string(type_str);
                let data: Retained<NSData> = NSData::with_bytes(bytes);
                let _: bool = msg_send![&*item, setData: &*data, forType: &*ns_type];
            }
            new_items.push(item);
        }
        if new_items.is_empty() {
            return;
        }
        // writeObjects: 接受 NSArray<id<NSPasteboardWriting>>；NSPasteboardItem 实现该协议。
        // 用 NSMutableArray + addObject: 构造，避免依赖 NSPasteboardWriting 类型绑定。
        let arr_cls = class!(NSMutableArray);
        let arr_alloc: *mut AnyObject = msg_send![arr_cls, alloc];
        let arr: *mut AnyObject = msg_send![arr_alloc, init];
        if arr.is_null() {
            return;
        }
        // 接管 alloc/init 返回的 +1 引用计数，作用域结束自动 release。
        let _arr_owner = Retained::from_raw(arr);
        for it in &new_items {
            let raw: *mut AnyObject = &**it as *const AnyObject as *mut AnyObject;
            let _: () = msg_send![arr, addObject: raw];
        }
        let _: bool = msg_send![&*pb, writeObjects: arr];
    }

    /// 仅用于「等待新内容到达」的轮询：从 generalPasteboard 取首个 public.utf8-plain-text。
    unsafe fn read_text_now() -> Option<String> {
        let pb = NSPasteboard::generalPasteboard();
        let type_str = ns_string("public.utf8-plain-text");
        let s: *mut AnyObject = msg_send![&*pb, stringForType: &*type_str];
        ns_string_to_string(s)
    }

    // Step 1: 先全格式备份当前剪贴板（图片/文件/RTF/HTML 等不丢）。
    let saved = unsafe { save_pasteboard_all() };

    // Step 2: 等修饰键释放（与 Windows 流程一致：全局快捷键按下后修饰键可能仍处按下态）。
    thread::sleep(Duration::from_millis(100));

    // Step 3: 清空剪贴板，便于检测新内容。
    unsafe { clear_pasteboard() };

    // Step 4: osascript 模拟 Cmd+C 触发当前应用的复制；失败时尝试还原后报错。
    let status = Command::new("osascript")
        .args([
            "-e",
            r#"tell application "System Events" to keystroke "c" using command down"#,
        ])
        .status()
        .map_err(|e| format!("模拟复制失败：{}", e))?;

    if !status.success() {
        unsafe { restore_pasteboard_all(&saved) };
        return Err(
            "模拟复制失败（请检查系统设置 → 隐私与安全性 → 辅助功能 / 自动化）".into(),
        );
    }

    // Step 5: 轮询是否有新文本到达（默认最长 ~800ms，无选区时提前退出）。
    let new_text = poll_clipboard_text(|| unsafe { read_text_now() }, opts);

    // Step 6: 还原原剪贴板（包括图片/文件/RTF 等所有格式）。
    unsafe { restore_pasteboard_all(&saved) };

    match new_text {
        Some(t) => Ok(t),
        None => Err("未检测到选中文本".into()),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_selected_text_with_options_impl(_opts: SelectionOptions) -> Result<String, String> {
    Err("Selected text retrieval not supported on this platform".to_string())
}
