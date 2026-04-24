#[derive(Debug, Clone, Default)]
pub struct ClipboardSource {
    pub app_name: Option<String>,
    pub app_path: Option<String>,
}

pub fn resolve_clipboard_source() -> ClipboardSource {
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
    use objc2_app_kit::NSRunningApplication;
    use objc2_app_kit::NSWorkspace;
    use std::ffi::CStr;

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
            let ptr = n.UTF8String();
            if !ptr.is_null() {
                let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
                if !s.trim().is_empty() {
                    name = Some(s);
                }
            }
        }
        let path_ns = front
            .bundleURL()
            .or_else(|| front.executableURL())
            .and_then(|url| url.path());
        if let Some(p) = path_ns {
            let ptr = p.UTF8String();
            if !ptr.is_null() {
                let s = CStr::from_ptr(ptr).to_string_lossy().into_owned();
                if !s.trim().is_empty() {
                    path = Some(s);
                }
            }
        }
    });
    ClipboardSource {
        app_name: name,
        app_path: path,
    }
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
            .strip_suffix(".exe")
            .or_else(|| base.strip_suffix(".EXE"))
            .unwrap_or(base)
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
