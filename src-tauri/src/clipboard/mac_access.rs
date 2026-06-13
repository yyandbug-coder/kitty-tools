//! macOS 剪贴板（NSPasteboard / arboard）访问串行化。
//!
//! 划词翻译、监听器、粘贴与自动复制译文会并发读写 general pasteboard；
//! 统一互斥避免备份/还原与监听轮询交错导致内容丢失或错乱。

#![cfg(target_os = "macos")]

use std::sync::Mutex;

static PASTEBOARD_LOCK: Mutex<()> = Mutex::new(());

/// 在持有 macOS 剪贴板互斥锁的情况下执行 `f`。
pub fn with_mac_pasteboard<T>(f: impl FnOnce() -> T) -> T {
    let guard = PASTEBOARD_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let out = f();
    drop(guard);
    out
}

pub fn arboard_get_text(cb: &mut arboard::Clipboard) -> Result<String, arboard::Error> {
    with_mac_pasteboard(|| cb.get_text())
}

pub fn arboard_get_image(
    cb: &mut arboard::Clipboard,
) -> Result<arboard::ImageData<'static>, arboard::Error> {
    with_mac_pasteboard(|| cb.get_image())
}

pub fn arboard_set_text(cb: &mut arboard::Clipboard, text: &str) -> Result<(), arboard::Error> {
    with_mac_pasteboard(|| cb.set_text(text))
}

pub fn arboard_set_image(
    cb: &mut arboard::Clipboard,
    image: arboard::ImageData<'_>,
) -> Result<(), arboard::Error> {
    with_mac_pasteboard(|| cb.set_image(image))
}
