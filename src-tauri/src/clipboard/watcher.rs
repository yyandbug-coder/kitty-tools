use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Emitter;

use super::source::resolve_clipboard_source;
use super::image_cache;

static CLIPBOARD_WATCHER_STARTED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEvent {
    pub id: String,
    pub r#type: String,
    pub content: String,
    pub content_hash: Option<String>,
    pub image_byte_size: Option<usize>,
    #[serde(default)]
    pub file_byte_sizes: Option<Vec<u64>>,
    pub file_paths: Option<Vec<String>>,
    pub image_rgba: Option<Vec<u8>>,
    pub image_width: Option<usize>,
    pub image_height: Option<usize>,
    pub timestamp: i64,
    pub source_app: Option<String>,
    pub source_app_path: Option<String>,
    #[serde(default)]
    pub favorited: Option<bool>,
}

#[tauri::command]
pub async fn start_clipboard_watcher(app: tauri::AppHandle) {
    if CLIPBOARD_WATCHER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    /// 超过此大小（字节）的文本将被忽略，防止内存暴涨
    const MAX_TEXT_BYTES: usize = 5 * 1024 * 1024; // 5 MB
    /// 剪贴板位图原始 RGBA 上限（与像素上限一致：约 8192×4096 Retina 整屏截图量级）。
    /// 再大易导致单次分配/PNG 编码峰值过高；若仍不够可略增，但需与 `image_cache` 磁盘策略一并考虑。
    const MAX_IMAGE_RGBA_BYTES: usize = 128 * 1024 * 1024; // 128 MiB
    const MAX_IMAGE_PIXELS: u64 = (MAX_IMAGE_RGBA_BYTES / 4) as u64;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut last_content = String::new();
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(cb) => cb,
            Err(e) => {
                eprintln!("[kitty-tools] 剪贴板初始化失败: {e}");
                CLIPBOARD_WATCHER_STARTED.store(false, Ordering::SeqCst);
                return;
            }
        };

        loop {
            std::thread::sleep(Duration::from_millis(300));

            let src = resolve_clipboard_source();

            #[cfg(target_os = "macos")]
            if let Some(file_paths) = super::paste::read_macos_clipboard_files() {
                let content_hash = image_cache::hash_file_paths(&file_paths);
                if last_content != content_hash {
                    last_content = content_hash;
                    let file_byte_sizes = image_cache::byte_sizes_for_file_paths(&file_paths);
                    let event = ClipboardEvent {
                        id: uuid::Uuid::new_v4().to_string(),
                        r#type: "file".to_string(),
                        content: image_cache::summarize_file_paths(&file_paths),
                        content_hash: None,
                        image_byte_size: None,
                        file_byte_sizes,
                        file_paths: Some(file_paths),
                        image_rgba: None,
                        image_width: None,
                        image_height: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        source_app: src.app_name.clone(),
                        source_app_path: src.app_path.clone(),
                        favorited: None,
                    };
                    let _ = app_handle.emit("clipboard-change", &event);
                }
                continue;
            }

            #[cfg(target_os = "windows")]
            if let Some(file_paths) = super::paste::read_windows_clipboard_files() {
                let content_hash = image_cache::hash_file_paths(&file_paths);
                if last_content != content_hash {
                    last_content = content_hash;
                    let file_byte_sizes = image_cache::byte_sizes_for_file_paths(&file_paths);
                    let event = ClipboardEvent {
                        id: uuid::Uuid::new_v4().to_string(),
                        r#type: "file".to_string(),
                        content: image_cache::summarize_file_paths(&file_paths),
                        content_hash: None,
                        image_byte_size: None,
                        file_byte_sizes,
                        file_paths: Some(file_paths),
                        image_rgba: None,
                        image_width: None,
                        image_height: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                        source_app: src.app_name.clone(),
                        source_app_path: src.app_path.clone(),
                        favorited: None,
                    };
                    let _ = app_handle.emit("clipboard-change", &event);
                }
                continue;
            }

            if let Ok(text) = clipboard.get_text() {
                if text.trim().is_empty() {
                    continue;
                }
                if text.len() > MAX_TEXT_BYTES {
                    continue;
                }
                if last_content == text {
                    continue;
                }
                last_content = text.clone();
                let event = ClipboardEvent {
                    id: uuid::Uuid::new_v4().to_string(),
                    r#type: "text".to_string(),
                    content: text,
                    content_hash: None,
                    image_byte_size: None,
                    file_byte_sizes: None,
                    file_paths: None,
                    image_rgba: None,
                    image_width: None,
                    image_height: None,
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    source_app: src.app_name.clone(),
                    source_app_path: src.app_path.clone(),
                    favorited: None,
                };
                let _ = app_handle.emit("clipboard-change", &event);
                continue;
            }

            if let Ok(image) = clipboard.get_image() {
                let w = image.width as u64;
                let h = image.height as u64;
                let pixels = w.saturating_mul(h);
                if pixels > MAX_IMAGE_PIXELS || image.bytes.len() > MAX_IMAGE_RGBA_BYTES {
                    continue;
                }
                let rgba = image.bytes.into_owned();
                let content_hash = image_cache::hash_image(&rgba, image.width, image.height);
                if last_content == content_hash {
                    continue;
                }
                last_content = content_hash.clone();
                let id = uuid::Uuid::new_v4().to_string();
                let image_byte_size = image_cache::cache_image(&app_handle, &id, image.width, image.height, &rgba);

                let event = ClipboardEvent {
                    id,
                    r#type: "image".to_string(),
                    content: format!("图片 {}x{}", image.width, image.height),
                    content_hash: Some(content_hash),
                    image_byte_size,
                    file_byte_sizes: None,
                    file_paths: None,
                    image_rgba: None,
                    image_width: Some(image.width),
                    image_height: Some(image.height),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                    source_app: src.app_name.clone(),
                    source_app_path: src.app_path.clone(),
                    favorited: None,
                };
                let _ = app_handle.emit("clipboard-change", &event);
                continue;
            }
        }
    });
}
