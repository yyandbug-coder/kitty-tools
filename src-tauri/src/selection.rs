#[cfg(target_os = "windows")]
pub fn get_selected_text() -> Result<String, String> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_TYPE, KEYBD_EVENT_FLAGS, VIRTUAL_KEY, VK_CONTROL, VK_SHIFT,
    };

    const CF_UNICODETEXT: u32 = 13;
    const KEYEVENTF_KEYUP: u32 = 0x0002;

    unsafe fn release_modifiers() {
        let mut inputs: [INPUT; 2] = std::mem::zeroed();

        inputs[0].r#type = INPUT_TYPE(1);
        inputs[0].Anonymous.ki.wVk = VIRTUAL_KEY(VK_CONTROL.0);
        inputs[0].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP);

        inputs[1].r#type = INPUT_TYPE(1);
        inputs[1].Anonymous.ki.wVk = VIRTUAL_KEY(VK_SHIFT.0);
        inputs[1].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP);

        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }

    unsafe fn send_ctrl_c() {
        let mut inputs: [INPUT; 4] = std::mem::zeroed();

        // Ctrl down
        inputs[0].r#type = INPUT_TYPE(1);
        inputs[0].Anonymous.ki.wVk = VIRTUAL_KEY(VK_CONTROL.0);
        inputs[0].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(0);

        // C down
        inputs[1].r#type = INPUT_TYPE(1);
        inputs[1].Anonymous.ki.wVk = VIRTUAL_KEY(0x43);
        inputs[1].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(0);

        // C up
        inputs[2].r#type = INPUT_TYPE(1);
        inputs[2].Anonymous.ki.wVk = VIRTUAL_KEY(0x43);
        inputs[2].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP);

        // Ctrl up
        inputs[3].r#type = INPUT_TYPE(1);
        inputs[3].Anonymous.ki.wVk = VIRTUAL_KEY(VK_CONTROL.0);
        inputs[3].Anonymous.ki.dwFlags = KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP);

        SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
    }

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
                    let wide: Vec<u16> = {
                        let mut len = 0usize;
                        let start = ptr as *const u16;
                        while *start.add(len) != 0 {
                            len += 1;
                        }
                        std::slice::from_raw_parts(start, len).to_vec()
                    };
                    let _ = GlobalUnlock(hglobal);
                    String::from_utf16(&wide).ok()
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

    // Step 2: Release any modifier keys that may still be held down from the
    // 全局划词/截图快捷键按下后，修饰键可能仍处于按下状态。
    unsafe { release_modifiers() };

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
    unsafe { send_ctrl_c() };

    // Step 6: Poll the clipboard for up to 1.5 seconds waiting for text.
    let mut new_text: Option<String> = None;
    for _ in 0..30 {
        std::thread::sleep(std::time::Duration::from_millis(50));
        if let Some(t) = unsafe { get_clipboard_text() } {
            if !t.trim().is_empty() {
                new_text = Some(t);
                break;
            }
        }
    }

    // Step 7: Restore the original clipboard content (all formats).
    unsafe { restore_clipboard_all(&saved_clipboard) };

    match new_text {
        Some(t) => Ok(t.trim().to_string()),
        None => Err("No text selected".to_string()),
    }
}

#[cfg(target_os = "macos")]
pub fn get_selected_text() -> Result<String, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    use std::thread;
    use std::time::Duration;

    fn pbpaste_text() -> Option<String> {
        let out = Command::new("pbpaste").output().ok()?;
        if !out.status.success() {
            return None;
        }
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    fn pbcopy_bytes(data: &[u8]) -> Result<(), String> {
        let mut child = Command::new("pbcopy")
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("pbcopy: {}", e))?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "pbcopy: 无标准输入".to_string())?;
        stdin
            .write_all(data)
            .map_err(|e| format!("pbcopy: {}", e))?;
        let status = child.wait().map_err(|e| format!("pbcopy: {}", e))?;
        if status.success() {
            Ok(())
        } else {
            Err("pbcopy 失败".into())
        }
    }

    // 与 Windows流程对齐：先备份剪贴板 → 等待修饰键释放 → 清空 → 模拟复制 → 轮询 → 还原
    let saved_clipboard = pbpaste_text();

    thread::sleep(Duration::from_millis(100));

    pbcopy_bytes(b"").map_err(|e| format!("清空剪贴板失败：{}", e))?;

    let status = Command::new("osascript")
        .args([
            "-e",
            r#"tell application "System Events" to keystroke "c" using command down"#,
        ])
        .status()
        .map_err(|e| format!("模拟复制失败：{}", e))?;

    if !status.success() {
        if let Some(ref s) = saved_clipboard {
            let _ = pbcopy_bytes(s.as_bytes());
        }
        return Err("模拟复制失败（请检查系统设置 → 隐私与安全性 → 辅助功能 / 自动化）".into());
    }

    let mut new_text: Option<String> = None;
    for _ in 0..30 {
        thread::sleep(Duration::from_millis(50));
        if let Some(t) = pbpaste_text() {
            if !t.trim().is_empty() {
                new_text = Some(t);
                break;
            }
        }
    }

    if let Some(s) = saved_clipboard {
        let _ = pbcopy_bytes(s.as_bytes());
    }

    match new_text {
        Some(t) => Ok(t.trim().to_string()),
        None => Err("未检测到选中文本".into()),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn get_selected_text() -> Result<String, String> {
    Err("Selected text retrieval not supported on this platform".to_string())
}
