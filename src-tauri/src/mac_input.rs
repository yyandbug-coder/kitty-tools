//! macOS CGEvent 键盘注入工具：与 `selection.rs::osascript Cmd+C` 不同，这里直接走
//! `core_graphics::CGEvent` 注入（无需 AppleScript / 自动化权限路径），用于剪贴板历史粘贴。

#![cfg(target_os = "macos")]

use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

const KEY_CODE_V: u16 = 0x09;

/// 模拟 Cmd+V（按下 → 抬起，复用同一 source 易触发 IME 时序问题，故每次新建）。
pub fn inject_cmd_v() -> Result<(), ()> {
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
