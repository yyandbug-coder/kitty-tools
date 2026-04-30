//! 启动器：可搜索的常用系统应用（Windows / macOS），与 Kitty 内置动作相区分。

use std::path::Path;
use std::sync::OnceLock;

use super::{collect_matches, LauncherItem, MatchableRow};

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

struct SysAppCompiled {
    app: &'static SysApp,
    title_lower: String,
    subtitle_lower: String,
    extras_lower: Vec<String>,
}

static COMPILED: OnceLock<Vec<SysAppCompiled>> = OnceLock::new();

fn compiled_apps() -> &'static [SysAppCompiled] {
    COMPILED
        .get_or_init(|| {
            all()
                .iter()
                .map(|app| SysAppCompiled {
                    app,
                    title_lower: app.title.to_lowercase(),
                    subtitle_lower: app.subtitle.to_lowercase(),
                    extras_lower: app.match_extra.iter().map(|s| s.to_lowercase()).collect(),
                })
                .collect()
        })
        .as_slice()
}

impl MatchableRow for SysAppCompiled {
    fn matches_lowered(&self, q_lower: &str) -> bool {
        self.title_lower.contains(q_lower)
            || self.subtitle_lower.contains(q_lower)
            || self.extras_lower.iter().any(|e| e.contains(q_lower))
    }
    fn to_item(&self) -> LauncherItem {
        self.app.to_item()
    }
}

/// 无关键词时展示全部；有关键词时按标题/副标题/附加词过滤。委托给 `super::collect_matches`，
/// 与 `builtins_table()` 共用同一份「空查询⇒全部 / 否则子串过滤」语义。
pub fn items_for_query(q: &str, q_lower: &str) -> Vec<LauncherItem> {
    collect_matches(compiled_apps(), q, q_lower)
}

impl SysApp {
    fn to_item(&self) -> LauncherItem {
        let (kind, payload) = match &self.act {
            AppLaunch::OpenPath(p) => ("open_path", (*p).to_string()),
            AppLaunch::OpenUrl(u) => ("open_url", (*u).to_string()),
            AppLaunch::WinStart(s) => ("win_shell", (*s).to_string()),
            AppLaunch::MacOpen(s) => ("mac_open", (*s).to_string()),
        };
        let icon_path = icon_path_for_sys_app(self);
        LauncherItem {
            id: self.id.to_string(),
            title: self.title.to_string(),
            subtitle: self.subtitle.to_string(),
            kind: kind.to_string(),
            payload,
            icon_path,
        }
    }
}

/// 为「系统应用」列表项解析可用于 `get_app_icon_data_url` 的路径
fn icon_path_for_sys_app(app: &SysApp) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(p) = windows_icon_path_by_id(app.id) {
            return Some(p);
        }
    }
    icon_path_from_app_launch(&app.act)
}

#[cfg(target_os = "windows")]
fn windows_icon_path_by_id(id: &str) -> Option<String> {
    if id == "sys-wt" {
        return windows_terminal_exe();
    }
    let candidates: &[&str] = match id {
        "sys-explorer" => &[r"C:\Windows\explorer.exe"],
        "sys-notepad" => &[r"C:\Windows\System32\notepad.exe"],
        "sys-calc" => &[
            r"C:\Windows\System32\win32calc.exe",
            r"C:\Windows\System32\calc.exe",
        ],
        "sys-mspaint" => &[r"C:\Windows\System32\mspaint.exe"],
        "sys-snipping" => &[
            r"C:\Windows\System32\SnippingTool\SnippingTool.exe",
            r"C:\Windows\System32\SnippingTool.exe",
        ],
        "sys-cmd" => &[r"C:\Windows\System32\cmd.exe"],
        "sys-pwsh" => &[r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"],
        "sys-control" => &[r"C:\Windows\System32\control.exe"],
        "sys-taskmgr" => {
            &[
                r"C:\Windows\System32\Taskmgr\Taskmgr.exe",
                r"C:\Windows\System32\taskmgr.exe",
            ]
        }
        "sys-regedit" => &[r"C:\Windows\regedit.exe"],
        "sys-mstsc" => &[r"C:\Windows\System32\mstsc.exe"],
        "sys-services" => &[r"C:\Windows\System32\services.msc"],
        "sys-diskmgmt" => &[r"C:\Windows\System32\diskmgmt.msc"],
        "sys-devmgmt" => &[r"C:\Windows\System32\devmgmt.msc"],
        "sys-odbcad32" => &[r"C:\Windows\System32\odbcad32.exe"],
        _ => return None,
    };
    first_existing(candidates)
}

#[cfg(target_os = "windows")]
fn windows_terminal_exe() -> Option<String> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let p = Path::new(&local)
        .join("Microsoft")
        .join("WindowsApps")
        .join("wt.exe");
    if p.exists() {
        return Some(p.to_string_lossy().into_owned());
    }
    let alt = Path::new(r"C:\Program Files\WindowsTerminal\wt.exe");
    if alt.exists() {
        return Some(alt.to_string_lossy().into_owned());
    }
    None
}

#[cfg(target_os = "windows")]
fn first_existing(paths: &[&str]) -> Option<String> {
    for p in paths {
        if Path::new(p).exists() {
            return Some(p.to_string());
        }
    }
    None
}

fn icon_path_from_app_launch(act: &AppLaunch) -> Option<String> {
    match act {
        AppLaunch::OpenPath(p) => {
            let p = *p;
            if Path::new(p).exists() {
                return Some(p.to_string());
            }
            #[cfg(windows)]
            {
                if p.eq_ignore_ascii_case("explorer") {
                    return first_existing(&[r"C:\Windows\explorer.exe"]);
                }
            }
            None
        }
        AppLaunch::OpenUrl(_) => None,
        AppLaunch::WinStart(cmd) => {
            #[cfg(target_os = "windows")]
            {
                return win_shell_icon_path(cmd);
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = cmd;
                None
            }
        }
        AppLaunch::MacOpen(name) => {
            #[cfg(target_os = "macos")]
            {
                macos_bundle_path_for_name(name)
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = name;
                None
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn win_shell_icon_path(cmd: &str) -> Option<String> {
    let c = cmd.trim();
    let candidates: &[&str] = match c {
        "calc" => &[
            r"C:\Windows\System32\win32calc.exe",
            r"C:\Windows\System32\calc.exe",
        ],
        "mspaint" => &[r"C:\Windows\System32\mspaint.exe"],
        "SnippingTool" | "snippingtool" => &[
            r"C:\Windows\System32\SnippingTool\SnippingTool.exe",
            r"C:\Windows\System32\SnippingTool.exe",
        ],
        "cmd" => &[r"C:\Windows\System32\cmd.exe"],
        "control" => &[r"C:\Windows\System32\control.exe"],
        "taskmgr" => &[
            r"C:\Windows\System32\Taskmgr\Taskmgr.exe",
            r"C:\Windows\System32\taskmgr.exe",
        ],
        "regedit" => &[r"C:\Windows\regedit.exe"],
        "mstsc" => &[r"C:\Windows\System32\mstsc.exe"],
        "services.msc" => &[r"C:\Windows\System32\services.msc"],
        "diskmgmt.msc" => &[r"C:\Windows\System32\diskmgmt.msc"],
        "devmgmt.msc" => &[r"C:\Windows\System32\devmgmt.msc"],
        _ => &[],
    };
    first_existing(candidates)
}

/// `MacOpen` 的 payload 为应用名，尝试常见 .app 路径
#[cfg(target_os = "macos")]
fn macos_bundle_path_for_name(name: &str) -> Option<String> {
    let n = name.trim();
    for base in ["/Applications", "/System/Applications", "/System/Applications/Utilities"] {
        let p = format!("{base}/{n}.app");
        if Path::new(&p).exists() {
            return Some(p);
        }
    }
    if n == "Finder" {
        let f = "/System/Library/CoreServices/Finder.app";
        if Path::new(f).exists() {
            return Some(f.to_string());
        }
    }
    if n == "Script Editor" {
        let s = "/System/Applications/Utilities/Script Editor.app";
        if Path::new(s).exists() {
            return Some(s.to_string());
        }
    }
    None
}

fn all() -> &'static [SysApp] {
    #[cfg(target_os = "windows")]
    {
        &WINDOWS
    }
    #[cfg(target_os = "macos")]
    {
        MAC
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
