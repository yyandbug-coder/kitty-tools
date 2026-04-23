use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

#[cfg(target_os = "macos")]
use base64::Engine;

const APP_ICON_CACHE_CAP: usize = 64;

static APP_ICON_CACHE: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn app_icon_cache_get(path: &str) -> Option<String> {
    APP_ICON_CACHE.lock().unwrap().get(path).cloned()
}

fn app_icon_cache_put(path: String, data_url: String) {
    let mut g = APP_ICON_CACHE.lock().unwrap();
    if g.len() >= APP_ICON_CACHE_CAP && !g.contains_key(&path) {
        g.clear();
    }
    g.insert(path, data_url);
}

#[cfg(target_os = "macos")]
unsafe fn macos_app_icon_data_url_on_main(path: &str) -> Option<String> {
    use image::codecs::png::PngEncoder;
    use image::{imageops, ImageEncoder, ImageFormat};
    use objc2::rc::Retained;
    use objc2_foundation::NSString;
    use objc2_app_kit::NSWorkspace;
    use std::ffi::c_void;
    use std::ptr::NonNull;

    let workspace = NSWorkspace::sharedWorkspace();
    let ns_path = NSString::from_str(path);
    let icon = workspace.iconForFile(&ns_path);
    let Some(tiff) = icon.TIFFRepresentation() else {
        return None;
    };
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
