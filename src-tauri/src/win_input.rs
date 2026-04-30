//! Windows 键盘事件注入工具。
//!
//! 把 `selection.rs` 与 `clipboard/paste.rs` 中重复的 `SendInput` 拼装抽到一处，
//! 单一定义减少维护成本，同时让「释放修饰键」与「注入组合键」用同一抽象。
//!
//! 注意：所有函数均为 `unsafe`，调用方需保证：
//! - 仅在桌面会话下调用（带 `User32`/`HID` 的进程；Tauri 主进程满足）；
//! - 不在 UI 线程长时间阻塞（建议 `std::thread::spawn` 内调用，与既有用法一致）。

#![cfg(target_os = "windows")]

use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_TYPE, KEYBD_EVENT_FLAGS, VIRTUAL_KEY, VK_CONTROL, VK_LCONTROL, VK_LMENU,
    VK_LSHIFT, VK_LWIN, VK_MENU, VK_RCONTROL, VK_RMENU, VK_RSHIFT, VK_RWIN, VK_SHIFT,
};

const KEYEVENTF_KEYUP_FLAG: u32 = 0x0002;

#[derive(Debug, Clone, Copy)]
pub enum KeyEventDir {
    Down,
    Up,
}

/// 将多组 `(VK, Down/Up)` 编排成 `INPUT` 数组并 `SendInput`。
///
/// 与逐个 `SendInput` 相比，单次调用可减少消息泵抢占空隙，更接近真实键盘节奏。
pub unsafe fn inject_key_combo(seq: &[(VIRTUAL_KEY, KeyEventDir)]) {
    if seq.is_empty() {
        return;
    }
    let mut inputs: Vec<INPUT> = vec![std::mem::zeroed(); seq.len()];
    for (i, (vk, dir)) in seq.iter().enumerate() {
        inputs[i].r#type = INPUT_TYPE(1);
        inputs[i].Anonymous.ki.wVk = *vk;
        inputs[i].Anonymous.ki.dwFlags = match dir {
            KeyEventDir::Down => KEYBD_EVENT_FLAGS(0),
            KeyEventDir::Up => KEYBD_EVENT_FLAGS(KEYEVENTF_KEYUP_FLAG),
        };
    }
    SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
}

/// 释放可能仍按下的所有修饰键（Shift / Ctrl / Alt / Win，含左右）。
///
/// 全局快捷键触发后修饰键往往尚未释放，注入 Ctrl+V/Ctrl+C 时残留键会污染目标应用收到的组合（如 Ctrl+Shift+V）。
pub unsafe fn release_all_modifiers() {
    let keys = [
        VIRTUAL_KEY(VK_SHIFT.0),
        VIRTUAL_KEY(VK_LSHIFT.0),
        VIRTUAL_KEY(VK_RSHIFT.0),
        VIRTUAL_KEY(VK_CONTROL.0),
        VIRTUAL_KEY(VK_LCONTROL.0),
        VIRTUAL_KEY(VK_RCONTROL.0),
        VIRTUAL_KEY(VK_MENU.0),
        VIRTUAL_KEY(VK_LMENU.0),
        VIRTUAL_KEY(VK_RMENU.0),
        VIRTUAL_KEY(VK_LWIN.0),
        VIRTUAL_KEY(VK_RWIN.0),
    ];
    let seq: Vec<(VIRTUAL_KEY, KeyEventDir)> =
        keys.iter().map(|k| (*k, KeyEventDir::Up)).collect();
    inject_key_combo(&seq);
}

/// 注入 Ctrl+`vk`（按下 → 抬起）；常用于 `inject_ctrl_v` / `inject_ctrl_c` 之上。
pub unsafe fn inject_ctrl_chord(vk: u16) {
    inject_key_combo(&[
        (VIRTUAL_KEY(VK_CONTROL.0), KeyEventDir::Down),
        (VIRTUAL_KEY(vk), KeyEventDir::Down),
        (VIRTUAL_KEY(vk), KeyEventDir::Up),
        (VIRTUAL_KEY(VK_CONTROL.0), KeyEventDir::Up),
    ]);
}

/// Ctrl+V（粘贴）。
pub unsafe fn inject_ctrl_v() {
    inject_ctrl_chord(0x56);
}

/// Ctrl+C（复制）。
pub unsafe fn inject_ctrl_c() {
    inject_ctrl_chord(0x43);
}
