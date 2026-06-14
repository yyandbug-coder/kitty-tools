use std::sync::atomic::AtomicBool;
#[cfg(not(target_os = "macos"))]
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex, MutexGuard};
use screenshots::image::RgbaImage;

/// 持锁线程 panic 会导致 Mutex 中毒；用 `into_inner()` 恢复 guard，避免连带崩溃。
pub(crate) fn lock_poisoned<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `Arc<Mutex<T>>` 上的便捷封装。
pub(crate) fn lock_poisoned_arc<T>(m: &Arc<Mutex<T>>) -> MutexGuard<'_, T> {
    lock_poisoned(&**m)
}

/// Unified application state shared across all modules (translate, clipboard, etc.).
pub struct AppState {
    pub client: reqwest::Client,
    pub pending_translation: Arc<Mutex<Option<PendingTranslation>>>,
    pub region_pending: Mutex<Option<RegionPending>>,
    pub region_capture: Mutex<Option<RgbaImage>>,
    /// Windows/Linux：全屏预截屏异步任务序号（macOS 选区走 SCK，无需此项）。
    #[cfg(not(target_os = "macos"))]
    pub region_capture_seq: AtomicU64,
    /// 浮动窗口正在交互（拖拽等），短暂抑制失焦自动隐藏。
    pub floating_interacting: Arc<AtomicBool>,
    /// 剪贴板弹窗正在交互（拖拽等），短暂抑制失焦自动隐藏。
    pub clipboard_interacting: Arc<AtomicBool>,
    /// 启动器正在交互（拖拽等），短暂抑制失焦自动隐藏。
    pub launcher_interacting: Arc<AtomicBool>,
    /// 从功能主页切到浮层/工作台：抑制失焦自动隐藏，避免「先 show 再 hide 主窗」时浮层一闪即关。
    pub suppress_overlay_autohide: Arc<AtomicBool>,
    /// 正在打开设置：抑制剪贴板/启动器失焦回调里的 `restore_previous_application()`，避免设置窗被抢焦点（仅 macOS）。
    #[cfg(target_os = "macos")]
    pub suppress_macos_overlay_restore: Arc<AtomicBool>,
}

/// Holds the current in-progress translation result for the floating window.
#[derive(Debug, Clone)]
pub struct PendingTranslation {
    pub state: String, // "idle" | "loading" | "result" | "error"
    pub source_text: String,
    pub translated_text: Option<String>,
    pub source_lang: Option<String>,
    #[allow(dead_code)]
    pub target_lang: Option<String>,
    pub error: Option<String>,
}

/// Tracks the pending screenshot region capture mode.
#[derive(Debug)]
pub enum RegionPending {
    Translate {
        source_lang: String,
        target_lang: String,
    },
}
