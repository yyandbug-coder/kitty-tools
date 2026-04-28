//! Windows：抑制无边框窗口由键盘触发的系统菜单（`Alt+Space` → `WM_SYSCOMMAND` / `SC_KEYMENU`）。
//! 否则在设置里录制「启动器」等含 Alt 的组合时，系统会先弹出还原/移动/关闭菜单，页面收不到完整按键。

use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};

const WM_SYSCOMMAND: u32 = 0x0112;
const SC_KEYMENU: usize = 0xF100;
const SYSMENU_SUBCLASS_ID: usize = 0x4B_54_4E_4F_53_59_53_31;

unsafe extern "system" fn suppress_keyboard_sysmenu_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _uidsubclass: usize,
    _dwrefdata: usize,
) -> LRESULT {
    if msg == WM_SYSCOMMAND && (wparam.0 & 0xFFF0) == SC_KEYMENU {
        return LRESULT(0);
    }
    unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
}

pub fn install_suppress_keyboard_sysmenu(hwnd: HWND) {
    unsafe {
        let _ = SetWindowSubclass(
            hwnd,
            Some(suppress_keyboard_sysmenu_proc),
            SYSMENU_SUBCLASS_ID,
            0,
        );
    }
}
