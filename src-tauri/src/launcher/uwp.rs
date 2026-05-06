//! UWP / MSIX 应用枚举（仅 Windows）。
//!
//! Windows 11 把大量内置应用（画图、计算器、记事本、截图工具等）以 MSIX 包形式分发，
//! 它们在「开始菜单」里以 `IO_REPARSE_TAG_APPEXECLINK` 别名形式露出，[`installed_apps::scan_windows_lnk`]
//! 这种基于 `.lnk` walkdir 的扫描完全捞不到。这里通过 PowerShell `Get-StartApps`
//! 一次性拉取「开始菜单已注册」的所有应用（含 Win32 与 UWP），过滤出 AppID 含 `!` 的纯 UWP
//! 条目作为补充。
//!
//! 启动语义：`shell:AppsFolder\<AppID>` 是 Windows shell 的标准 UWP 启动协议，配合
//! `cmd /C start "" <payload>`（即现有的 `win_shell` 类型）即可激活。
//!
//! 性能：Get-StartApps 首次冷调通常 200~600ms（取决于已安装包数）；warmup 已在后台线程，
//! 不影响主流程。第二次启动会因为 PowerShell JIT 缓存更快。

use std::os::windows::process::CommandExt;
use std::process::Command;

/// 防止 `cmd.exe` / `powershell.exe` 在桌面上闪现一帧黑窗。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone)]
pub(super) struct UwpEntry {
    pub name: String,
    /// `<package_family_name>!<app_id>` 形式（含 `!`）。
    pub app_id: String,
}

/// 调 PowerShell `Get-StartApps`，返回纯 UWP 条目（AppID 含 `!`）。
/// 失败（无 PowerShell、命令异常）时返回空切片，不让 launcher 整体报错。
pub(super) fn enumerate_uwp_apps() -> Vec<UwpEntry> {
    // 用 ConvertTo-Json 输出严格 JSON，避免被本地化、列宽截断打乱解析。
    // `-Compress` 减小 stdout 体量；`-Depth 3` 足够 Get-StartApps 的扁平对象。
    const PS_SCRIPT: &str =
        "Get-StartApps | Where-Object { $_.AppID -match '!' } \
         | Select-Object Name, AppID | ConvertTo-Json -Compress -Depth 3";

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            PS_SCRIPT,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    let Ok(out) = output else {
        return Vec::new();
    };
    if !out.status.success() {
        return Vec::new();
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    parse_get_startapps_json(stdout.trim())
}

/// `Get-StartApps | ConvertTo-Json` 的输出在「单条结果」时是单对象、多条时是数组；
/// 这里都接受。每个对象只用 `Name` 和 `AppID` 两个字段。
fn parse_get_startapps_json(text: &str) -> Vec<UwpEntry> {
    if text.is_empty() {
        return Vec::new();
    }
    let v: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    let mut out = Vec::new();
    let push_one = |obj: &serde_json::Value, out: &mut Vec<UwpEntry>| {
        let name = obj.get("Name").and_then(|x| x.as_str()).unwrap_or("").trim();
        let app_id = obj
            .get("AppID")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim();
        if name.is_empty() || app_id.is_empty() || !app_id.contains('!') {
            return;
        }
        out.push(UwpEntry {
            name: name.to_string(),
            app_id: app_id.to_string(),
        });
    };
    match &v {
        serde_json::Value::Array(arr) => {
            for item in arr {
                push_one(item, &mut out);
            }
        }
        obj @ serde_json::Value::Object(_) => push_one(obj, &mut out),
        _ => {}
    }
    out
}

/// 把 AppID 包装成 shell URI；这是 Windows shell 自身识别的 UWP 启动地址，
/// 也可作为 [`IShellItemImageFactory`] 的 parsing name 直接拉图标。
pub(super) fn shell_apps_folder_uri(app_id: &str) -> String {
    format!("shell:AppsFolder\\{app_id}")
}

/// 判定 `path` 是否为 `shell:AppsFolder\...` 形式（不区分大小写）。
/// `resolve_icon_data_url` 用它跳过 `Path::exists` 这类磁盘探测。
pub fn is_shell_apps_folder_uri(path: &str) -> bool {
    let p = path.trim_start();
    p.len() > "shell:AppsFolder\\".len()
        && p.get(..16)
            .map(|s| s.eq_ignore_ascii_case("shell:appsfolder"))
            .unwrap_or(false)
}
