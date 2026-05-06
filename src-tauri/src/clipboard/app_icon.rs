use std::collections::VecDeque;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

#[cfg(target_os = "macos")]
use base64::Engine;

use crate::app_state::lock_poisoned;

const APP_ICON_CACHE_CAP: usize = 64;

/// LRU 字典：`order` 记录访问顺序（最近的在尾），`map` 存路径→data URL。
/// 之前用 `HashMap` + 「满则 `clear()`」，会一次性丢掉所有图标，列表里下一帧重新批量调用全部回到 worker，
/// 出现可见的图标闪烁；这里改为按容量淘汰最久未使用的一条即可。
struct AppIconCache {
    map: std::collections::HashMap<String, String>,
    order: VecDeque<String>,
}

impl AppIconCache {
    fn new() -> Self {
        Self {
            map: std::collections::HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn get(&mut self, key: &str) -> Option<String> {
        let value = self.map.get(key).cloned()?;
        if let Some(pos) = self.order.iter().position(|k| k == key) {
            // 命中即提到队尾标记为最新使用。
            if let Some(k) = self.order.remove(pos) {
                self.order.push_back(k);
            }
        }
        Some(value)
    }

    fn put(&mut self, key: String, value: String) {
        if self.map.contains_key(&key) {
            if let Some(pos) = self.order.iter().position(|k| k == &key) {
                self.order.remove(pos);
            }
        } else if self.map.len() >= APP_ICON_CACHE_CAP {
            // 淘汰最早进入且未再访问过的一条，保留其它热路径。
            if let Some(oldest) = self.order.pop_front() {
                self.map.remove(&oldest);
            }
        }
        self.map.insert(key.clone(), value);
        self.order.push_back(key);
    }
}

static APP_ICON_CACHE: LazyLock<Mutex<AppIconCache>> =
    LazyLock::new(|| Mutex::new(AppIconCache::new()));

fn app_icon_cache_get(path: &str) -> Option<String> {
    lock_poisoned(&*APP_ICON_CACHE).get(path)
}

fn app_icon_cache_put(path: String, data_url: String) {
    lock_poisoned(&*APP_ICON_CACHE).put(path, data_url);
}

#[cfg(target_os = "macos")]
unsafe fn macos_app_icon_data_url_on_main(path: &str) -> Option<String> {
    use image::codecs::png::PngEncoder;
    use image::{imageops, ImageEncoder, ImageFormat};
    use objc2_foundation::NSString;
    use objc2_app_kit::NSWorkspace;
    use std::ffi::c_void;
    use std::ptr::NonNull;

    let workspace = NSWorkspace::sharedWorkspace();
    let ns_path = NSString::from_str(path);
    let icon = workspace.iconForFile(&ns_path);
    let tiff = icon.TIFFRepresentation()?;
    let len = tiff.length();
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u8; len];
    let nn = NonNull::new(buf.as_mut_ptr().cast::<c_void>())?;
    tiff.getBytes_length(nn, len);
    let img = image::load_from_memory_with_format(&buf, ImageFormat::Tiff)
        .ok()?
        .into_rgba8();
    const ICON: u32 = 32;
    let thumb = if img.width() == ICON && img.height() == ICON {
        img
    } else {
        imageops::resize(&img, ICON, ICON, imageops::FilterType::Triangle)
    };
    let mut png_buf: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png_buf)
        .write_image(thumb.as_raw(), ICON, ICON, image::ExtendedColorType::Rgba8)
        .ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{b64}"))
}

#[cfg(target_os = "macos")]
fn macos_app_icon_data_url(path: &str) -> Option<String> {
    let path_owned = path.to_string();
    if unsafe { libc::pthread_main_np() != 0 } {
        unsafe { macos_app_icon_data_url_on_main(&path_owned) }
    } else {
        let mut out: Option<String> = None;
        dispatch::Queue::main().exec_sync(|| {
            out = unsafe { macos_app_icon_data_url_on_main(&path_owned) };
        });
        out
    }
}

#[cfg(target_os = "windows")]
fn windows_app_icon_data_url(path: &str) -> Option<String> {
    let b64 = windows_icons::get_icon_base64_by_path(path).ok()?;
    Some(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn get_app_icon_data_url(path: String) -> Option<String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return None;
    }
    if !Path::new(&path).exists() {
        return None;
    }
    if let Some(cached) = app_icon_cache_get(&path) {
        return Some(cached);
    }
    let data_url = {
        #[cfg(target_os = "macos")]
        {
            macos_app_icon_data_url(&path)
        }
        #[cfg(target_os = "windows")]
        {
            windows_app_icon_data_url(&path)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            None::<String>
        }
    }?;
    app_icon_cache_put(path, data_url.clone());
    Some(data_url)
}
