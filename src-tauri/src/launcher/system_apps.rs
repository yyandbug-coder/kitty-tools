//! 启动器：可搜索的常用系统应用（Windows / macOS），与 Kitty 内置动作相区分。

use super::LauncherItem;

struct SysApp {
    id: &'static str,
    title: &'static str,
    /// 展示在副标题，含「系统应用」等便于搜索
    subtitle: &'static str,
    /// 额外可匹配小写子串（如英文名）
    match_extra: &'static [&'static str],
    act: AppLaunch,
}

/// 在 Windows 构建中不会构造 `MacOpen`，反之亦然，故允许未使用变体。
#[allow(dead_code)]
enum AppLaunch {
    /// 已有 `open_path` 与特殊 shell 逻辑
    OpenPath(&'static str),
    OpenUrl(&'static str),
    /// Windows: `cmd /C start "" <payload>`（可填 calc、ms-settings:、.msc 等）
    WinStart(&'static str),
    /// macOS: `open -a "…"`
    MacOpen(&'static str),
}

/// 无关键词时展示全部；有关键词时按标题/副标题/附加词过滤。
pub fn items_for_query(q: &str, q_lower: &str) -> Vec<LauncherItem> {
    let apps = all();
    if q.trim().is_empty() {
        return apps.iter().map(|a| a.to_item()).collect();
    }
    apps
        .iter()
        .filter(|a| a.matches(q_lower))
        .map(|a| a.to_item())
        .collect()
}

impl SysApp {
    fn matches(&self, q_lower: &str) -> bool {
        if q_lower.is_empty() {
            return true;
        }
        let t = self.title.to_lowercase();
        let s = self.subtitle.to_lowercase();
        if t.contains(q_lower) || s.contains(q_lower) {
            return true;
        }
        self.match_extra
            .iter()
            .any(|x| x.to_lowercase().contains(q_lower))
    }

    fn to_item(&self) -> LauncherItem {
        let (kind, payload) = match &self.act {
            AppLaunch::OpenPath(p) => ("open_path", (*p).to_string()),
            AppLaunch::OpenUrl(u) => ("open_url", (*u).to_string()),
            AppLaunch::WinStart(s) => ("win_shell", (*s).to_string()),
            AppLaunch::MacOpen(s) => ("mac_open", (*s).to_string()),
        };
        LauncherItem {
            id: self.id.to_string(),
            title: self.title.to_string(),
            subtitle: self.subtitle.to_string(),
            kind: kind.to_string(),
            payload,
        }
    }
}

fn all() -> &'static [SysApp] {
    #[cfg(target_os = "windows")]
    {
        &WINDOWS
    }
    #[cfg(target_os = "macos")]
    {
        &MAC
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        &[]
    }
}

#[cfg(target_os = "windows")]
const WINDOWS: &[SysApp] = &[
    SysApp {
        id: "sys-explorer",
        title: "文件资源管理器",
        subtitle: "系统应用",
        match_extra: &["explorer", "file explorer", "资源管理器"],
        act: AppLaunch::OpenPath("explorer"),
    },
    SysApp {
        id: "sys-notepad",
        title: "记事本",
        subtitle: "系统应用",
        match_extra: &["notepad", "文本文档"],
        act: AppLaunch::OpenPath(r"C:\Windows\System32\notepad.exe"),
    },
    SysApp {
        id: "sys-calc",
        title: "计算器",
        subtitle: "系统应用",
        match_extra: &["calculator", "calc"],
        act: AppLaunch::WinStart("calc"),
    },
    SysApp {
        id: "sys-mspaint",
        title: "画图",
        subtitle: "系统应用",
        match_extra: &["mspaint", "paint", "绘图"],
        act: AppLaunch::WinStart("mspaint"),
    },
    SysApp {
        id: "sys-snipping",
        title: "截图工具",
        subtitle: "系统应用",
        match_extra: &["snip", "snipping", "截屏", "截圖", "Screen Snipping"],
        act: AppLaunch::WinStart("SnippingTool"),
    },
    SysApp {
        id: "sys-cmd",
        title: "命令提示符",
        subtitle: "系统应用",
        match_extra: &["cmd", "command prompt", "命令行"],
        act: AppLaunch::WinStart("cmd"),
    },
    SysApp {
        id: "sys-pwsh",
        title: "Windows PowerShell",
        subtitle: "系统应用",
        match_extra: &["powershell", "pwsh"],
        act: AppLaunch::OpenPath(
            r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
        ),
    },
    SysApp {
        id: "sys-ms-settings",
        title: "设置",
        subtitle: "系统应用（Windows 设置）",
        match_extra: &["ms-settings", "系统设置", "Settings"],
        act: AppLaunch::OpenUrl("ms-settings:"),
    },
    SysApp {
        id: "sys-control",
        title: "控制面板",
        subtitle: "系统应用",
        match_extra: &["control panel", "控制"],
        act: AppLaunch::WinStart("control"),
    },
    SysApp {
        id: "sys-taskmgr",
        title: "任务管理器",
        subtitle: "系统应用",
        match_extra: &["task manager", "taskmgr", "任务"],
        act: AppLaunch::WinStart("taskmgr"),
    },
    SysApp {
        id: "sys-regedit",
        title: "注册表编辑器",
        subtitle: "系统应用",
        match_extra: &["regedit", "注册表", "Registry"],
        act: AppLaunch::WinStart("regedit"),
    },
    SysApp {
        id: "sys-mstsc",
        title: "远程桌面连接",
        subtitle: "系统应用",
        match_extra: &["mstsc", "remote desktop", "RDP", "远程"],
        act: AppLaunch::WinStart("mstsc"),
    },
    SysApp {
        id: "sys-services",
        title: "服务",
        subtitle: "系统应用 (services.msc)",
        match_extra: &["services", "服务"],
        act: AppLaunch::WinStart("services.msc"),
    },
    SysApp {
        id: "sys-diskmgmt",
        title: "磁盘管理",
        subtitle: "系统应用 (diskmgmt.msc)",
        match_extra: &["disk management", "diskmgmt", "磁碟", "磁碟管理"],
        act: AppLaunch::WinStart("diskmgmt.msc"),
    },
    SysApp {
        id: "sys-devmgmt",
        title: "设备管理器",
        subtitle: "系统应用 (devmgmt.msc)",
        match_extra: &["device manager", "devmgmt", "裝置", "设备"],
        act: AppLaunch::WinStart("devmgmt.msc"),
    },
    SysApp {
        id: "sys-wt",
        title: "Windows 终端",
        subtitle: "系统应用（若已安装）",
        match_extra: &["windows terminal", "wt", "终端"],
        act: AppLaunch::WinStart("wt"),
    },
    SysApp {
        id: "sys-odbcad32",
        title: "ODBC 数据源",
        subtitle: "系统应用 (64 位)",
        match_extra: &["odbc", "odbcad32", "資料來源", "数据源"],
        act: AppLaunch::OpenPath(r"C:\Windows\System32\odbcad32.exe"),
    },
];

#[cfg(target_os = "macos")]
const MAC: &[SysApp] = &[
    SysApp {
        id: "mac-finder",
        title: "访达",
        subtitle: "系统应用 (Finder)",
        match_extra: &["finder", "文件", "file"],
        act: AppLaunch::OpenPath("/System/Library/CoreServices/Finder.app"),
    },
    SysApp {
        id: "mac-settings",
        title: "系统设置",
        subtitle: "系统应用",
        match_extra: &["settings", "preferences", "首选项", "系統", "系统"],
        act: AppLaunch::OpenUrl("x-apple.systempreferences:"),
    },
    SysApp {
        id: "mac-terminal",
        title: "终端",
        subtitle: "系统应用 (Terminal)",
        match_extra: &["terminal", "命令行", "term"],
        act: AppLaunch::MacOpen("Terminal"),
    },
    SysApp {
        id: "mac-calc",
        title: "计算器",
        subtitle: "系统应用",
        match_extra: &["calculator", "calc", "算数"],
        act: AppLaunch::MacOpen("Calculator"),
    },
    SysApp {
        id: "mac-textedit",
        title: "文本编辑",
        subtitle: "系统应用",
        match_extra: &["textedit", "text edit", "文本"],
        act: AppLaunch::MacOpen("TextEdit"),
    },
    SysApp {
        id: "mac-activity",
        title: "活动监视器",
        subtitle: "系统应用 (Activity Monitor)",
        match_extra: &["activity", "活动", "任务", "top"],
        act: AppLaunch::MacOpen("Activity Monitor"),
    },
    SysApp {
        id: "mac-diskutil",
        title: "磁盘工具",
        subtitle: "系统应用 (Disk Utility)",
        match_extra: &["disk", "磁盘", "磁碟", "util"],
        act: AppLaunch::MacOpen("Disk Utility"),
    },
    SysApp {
        id: "mac-screenshot",
        title: "截屏与录屏",
        subtitle: "系统应用 (Screenshot)",
        match_extra: &["screen", "截屏", "录屏", "抓图"],
        act: AppLaunch::MacOpen("Screenshot"),
    },
    SysApp {
        id: "mac-preview",
        title: "预览",
        subtitle: "系统应用 (Preview)",
        match_extra: &["preview", "預覽", "图片"],
        act: AppLaunch::MacOpen("Preview"),
    },
    SysApp {
        id: "mac-script-editor",
        title: "脚本编辑器",
        subtitle: "系统应用",
        match_extra: &["script", "AppleScript", "腳本"],
        act: AppLaunch::MacOpen("Script Editor"),
    },
];
