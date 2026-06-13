//! Windows 剪贴板访问串行化与安全格式判断。
//!
//! 划词翻译需临时清空/还原剪贴板；监听器与其它模块也会读写剪贴板。
//! 统一互斥避免 `OpenClipboard` 竞争；并跳过不能当作 HGLOBAL 处理的格式，防止 `GlobalLock` 触发访问违例闪退。

#![cfg(target_os = "windows")]

use std::sync::Mutex;
use std::time::Duration;

static CLIPBOARD_LOCK: Mutex<()> = Mutex::new(());

pub use crate::clipboard::limits::MAX_FORMAT_BYTES;

/// 在持有 Windows 剪贴板互斥锁的情况下执行 `f`。
pub fn with_win_clipboard<T>(f: impl FnOnce() -> T) -> T {
    let guard = CLIPBOARD_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let out = f();
    drop(guard);
    out
}

/// `GetClipboardData` 返回值并非都是 HGLOBAL。对下列格式调用 `GlobalLock` 可能直接闪退。
pub fn format_is_safe_global_memory(fmt: u32) -> bool {
    !matches!(
        fmt,
        2 |   // CF_BITMAP -> HBITMAP
        3 |   // CF_METAFILEPICT（含嵌套 GDI 句柄，整块 memcpy 还原不可靠）
        9 |   // CF_PALETTE -> HPALETTE
        14 |  // CF_ENHMETAFILE -> HENHMETAFILE
        128 | // CF_OWNERDISPLAY
        129   // CF_DSPTYPE
    )
}

/// `OpenClipboard` 带短重试，缓解与其它进程/线程的瞬时竞争。
pub unsafe fn open_clipboard_with_retry(max_attempts: u32) -> bool {
    use windows::Win32::System::DataExchange::OpenClipboard;

    for attempt in 0..max_attempts {
        if OpenClipboard(None).is_ok() {
            return true;
        }
        if attempt + 1 < max_attempts {
            std::thread::sleep(Duration::from_millis(10 * (attempt + 1) as u64));
        }
    }
    false
}

pub fn arboard_get_text(cb: &mut arboard::Clipboard) -> Result<String, arboard::Error> {
    with_win_clipboard(|| cb.get_text())
}

pub fn arboard_get_image(
    cb: &mut arboard::Clipboard,
) -> Result<arboard::ImageData<'static>, arboard::Error> {
    with_win_clipboard(|| cb.get_image())
}

pub fn arboard_set_text(cb: &mut arboard::Clipboard, text: &str) -> Result<(), arboard::Error> {
    with_win_clipboard(|| cb.set_text(text))
}

pub fn arboard_set_image(
    cb: &mut arboard::Clipboard,
    image: arboard::ImageData<'_>,
) -> Result<(), arboard::Error> {
    with_win_clipboard(|| cb.set_image(image))
}
