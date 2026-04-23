use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};
use screenshots::image::RgbaImage;

use crate::config::AppConfig;

/// Unified application state shared across all modules (translate, clipboard, etc.).
pub struct AppState {
    #[allow(dead_code)]
    pub client: reqwest::Client,
    #[allow(dead_code)]
    pub config: Mutex<AppConfig>,
    pub pending_translation: Arc<Mutex<Option<PendingTranslation>>>,
    pub region_pending: Mutex<Option<RegionPending>>,
    pub region_capture: Mutex<Option<RgbaImage>>,
    #[allow(dead_code)]
    pub tray_click_generation: Arc<AtomicU64>,
    /// 浮动窗口正在交互（拖拽等），短暂抑制失焦自动隐藏。
    pub floating_interacting: Arc<AtomicBool>,
}

/// Holds the current in-progress translation result for the floating window.
#[derive(Debug, Clone)]
pub struct PendingTranslation {
    pub state: String, // "loading" | "result" | "error"
    pub source_text: String,
    pub translated_text: Option<String>,
    pub source_lang: Option<String>,
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
