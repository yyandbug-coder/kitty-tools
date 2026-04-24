use image::codecs::png::PngEncoder;
use image::{imageops, ImageBuffer, ImageEncoder, RgbaImage};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::sync::Mutex;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
};
use tauri::Manager;

const MAX_CACHED_IMAGES: usize = 100;
const MAX_CACHED_IMAGE_BYTES: usize = 48 * 1024 * 1024;
const PREVIEW_MAX_EDGE: u32 = 420;
const MAX_IN_MEMORY_RGBA_BYTES: usize = 8 * 1024 * 1024;

const CLIPBOARD_IMAGE_MAGIC: &[u8; 4] = b"KCH\x01";
const CLIPBOARD_IMAGE_MAGIC_PNG: &[u8; 4] = b"KCH\x02";

static IMAGE_CACHE: Mutex<Vec<CachedImage>> = Mutex::new(Vec::new());

#[derive(Clone)]
pub(crate) struct CachedImage {
    id: String,
    width: usize,
    height: usize,
    bytes: Vec<u8>,
}

fn sanitize_clipboard_image_id(id: &str) -> Option<&str> {
    if id.is_empty() || id.len() > 200 {
        return None;
    }
    if id.chars().any(|c| matches!(c, '/' | '\\' | ':' | '\0')) {
        return None;
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }
    Some(id)
}

fn clipboard_images_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<std::path::PathBuf, std::io::Error> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    let dir = base.join("clipboard_images");
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn clipboard_preview_path<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Option<std::path::PathBuf> {
    let safe_id = sanitize_clipboard_image_id(id)?;
    let dir = clipboard_images_dir(app).ok()?;
    Some(dir.join(format!("{safe_id}.preview.png")))
}

fn rgba_to_png_bytes(width: usize, height: usize, rgba: &[u8]) -> Option<Vec<u8>> {
    let mut buf = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut buf, width as u32, height as u32);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_compression(png::Compression::Fast);
        let mut writer = enc.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(buf)
}

fn rgba_to_preview_png_bytes(
    width: usize,
    height: usize,
    rgba: &[u8],
    max_edge: u32,
) -> Option<Vec<u8>> {
    let w = width as u32;
    let h = height as u32;
    let img: RgbaImage = ImageBuffer::from_raw(w, h, rgba.to_vec())?;
    let scale = (max_edge as f64 / w.max(h) as f64).min(1.0);
    let nw = ((w as f64 * scale).round() as u32).max(1);
    let nh = ((h as f64 * scale).round() as u32).max(1);

    let thumb = if nw == w && nh == h {
        img
    } else {
        imageops::resize(&img, nw, nh, imageops::FilterType::Triangle)
    };

    let mut png_buf: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png_buf)
        .write_image(thumb.as_raw(), nw, nh, image::ExtendedColorType::Rgba8)
        .ok()?;
    Some(png_buf)
}

fn persist_clipboard_preview<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    width: usize,
    height: usize,
    bytes: &[u8],
) {
    let Some(path) = clipboard_preview_path(app, id) else {
        return;
    };
    let Some(png) = rgba_to_preview_png_bytes(width, height, bytes, PREVIEW_MAX_EDGE) else {
        return;
    };
    let _ = fs::write(path, png);
}

fn persist_clipboard_image<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
    width: usize,
    height: usize,
    bytes: &[u8],
) -> Option<usize> {
    let Some(safe_id) = sanitize_clipboard_image_id(id) else {
        return None;
    };
    let Ok(dir) = clipboard_images_dir(app) else {
        return None;
    };
    let Some(png) = rgba_to_png_bytes(width, height, bytes) else {
        return None;
    };
    let path = dir.join(format!("{safe_id}.kchi"));
    let mut buf = Vec::with_capacity(16 + png.len());
    buf.extend_from_slice(CLIPBOARD_IMAGE_MAGIC_PNG);
    buf.extend_from_slice(&(width as u32).to_le_bytes());
    buf.extend_from_slice(&(height as u32).to_le_bytes());
    buf.extend_from_slice(&(png.len() as u32).to_le_bytes());
    buf.extend_from_slice(&png);
    let _ = fs::write(path, buf);
    Some(png.len())
}

fn load_clipboard_image_from_disk<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Option<CachedImage> {
    let safe_id = sanitize_clipboard_image_id(id)?;
    let dir = clipboard_images_dir(app).ok()?;
    let path = dir.join(format!("{safe_id}.kchi"));
    let mut f = fs::File::open(path).ok()?;
    let mut raw = Vec::new();
    f.read_to_end(&mut raw).ok()?;
    if raw.len() < 12 {
        return None;
    }
    let magic = raw.get(0..4)?;
    if magic == CLIPBOARD_IMAGE_MAGIC_PNG {
        let width = u32::from_le_bytes(raw.get(4..8)?.try_into().ok()?) as usize;
        let height = u32::from_le_bytes(raw.get(8..12)?.try_into().ok()?) as usize;
        let png_len = u32::from_le_bytes(raw.get(12..16)?.try_into().ok()?) as usize;
        let end = 16usize.checked_add(png_len)?;
        let png = raw.get(16..end)?;
        let rgba = image::load_from_memory(png).ok()?.into_rgba8();
        let (w, h) = rgba.dimensions();
        if w as usize != width || h as usize != height {
            return None;
        }
        return Some(CachedImage {
            id: id.to_string(),
            width,
            height,
            bytes: rgba.into_raw(),
        });
    }
    if magic != CLIPBOARD_IMAGE_MAGIC {
        return None;
    }
    let width = u32::from_le_bytes(raw.get(4..8)?.try_into().ok()?) as usize;
    let height = u32::from_le_bytes(raw.get(8..12)?.try_into().ok()?) as usize;
    let rgba = raw.get(12..)?.to_vec();
    let expected = width.checked_mul(height)?.checked_mul(4)?;
    if rgba.len() != expected {
        return None;
    }
    Some(CachedImage {
        id: id.to_string(),
        width,
        height,
        bytes: rgba,
    })
}

fn put_image_in_memory_cache(id: &str, width: usize, height: usize, bytes: &[u8]) {
    let mut cache = IMAGE_CACHE.lock().unwrap();
    cache.retain(|entry| entry.id != id);
    cache.push(CachedImage {
        id: id.to_string(),
        width,
        height,
        bytes: bytes.to_vec(),
    });

    while cache.len() > MAX_CACHED_IMAGES
        || cache.iter().map(|entry| entry.bytes.len()).sum::<usize>() > MAX_CACHED_IMAGE_BYTES
    {
        cache.remove(0);
    }
}

fn prune_image_memory_cache(keep: &HashSet<String>) {
    let mut cache = IMAGE_CACHE.lock().unwrap();
    cache.retain(|entry| keep.contains(&entry.id));
}

pub fn cache_image<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str, width: usize, height: usize, bytes: &[u8]) -> Option<usize> {
    let byte_size = persist_clipboard_image(app, id, width, height, bytes);
    persist_clipboard_preview(app, id, width, height, bytes);
    if bytes.len() <= MAX_IN_MEMORY_RGBA_BYTES {
        put_image_in_memory_cache(id, width, height, bytes);
    }
    byte_size
}

pub fn resolve_image_entry<R: tauri::Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Option<CachedImage> {
    {
        let mut cache = IMAGE_CACHE.lock().unwrap();
        if let Some(idx) = cache.iter().position(|e| e.id == id) {
            let entry = cache.remove(idx);
            cache.push(entry.clone());
            return Some(entry);
        }
    }
    let loaded = load_clipboard_image_from_disk(app, id)?;
    if loaded.bytes.len() <= MAX_IN_MEMORY_RGBA_BYTES {
        put_image_in_memory_cache(id, loaded.width, loaded.height, &loaded.bytes);
    }
    Some(loaded)
}

pub fn load_image_for_paste<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    item: &super::ClipboardEvent,
) -> Option<(usize, usize, Vec<u8>)> {
    if let Some(entry) = resolve_image_entry(app, &item.id) {
        return Some((entry.width, entry.height, entry.bytes));
    }
    match (item.image_width, item.image_height, item.image_rgba.clone()) {
        (Some(width), Some(height), Some(bytes)) => Some((width, height, bytes)),
        _ => None,
    }
}

pub fn hash_image(bytes: &[u8], width: usize, height: usize) -> String {
    let mut hasher = DefaultHasher::new();
    width.hash(&mut hasher);
    height.hash(&mut hasher);
    bytes.hash(&mut hasher);
    format!("image:{:x}", hasher.finish())
}

pub fn hash_file_paths(paths: &[String]) -> String {
    let mut hasher = DefaultHasher::new();
    paths.hash(&mut hasher);
    format!("file:{:x}", hasher.finish())
}

pub fn summarize_file_paths(paths: &[String]) -> String {
    if paths.is_empty() {
        return "文件".to_string();
    }
    if paths.len() == 1 {
        return std::path::Path::new(&paths[0])
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| paths[0].clone());
    }
    format!("{} 个文件", paths.len())
}

pub fn byte_sizes_for_file_paths(paths: &[String]) -> Option<Vec<u64>> {
    if paths.is_empty() {
        return None;
    }
    Some(
        paths
            .iter()
            .map(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0))
            .collect(),
    )
}

#[tauri::command]
pub fn get_image_preview_asset_path(app: tauri::AppHandle, id: String, max_edge: Option<u32>) -> Option<String> {
    let max_edge = max_edge.unwrap_or(PREVIEW_MAX_EDGE);
    if max_edge == PREVIEW_MAX_EDGE {
        if let Some(path) = clipboard_preview_path(&app, &id) {
            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }

    let entry = resolve_image_entry(&app, &id)?;
    let png = rgba_to_preview_png_bytes(entry.width, entry.height, &entry.bytes, max_edge)?;
    let path = clipboard_preview_path(&app, &id)?;
    if fs::write(&path, png).is_ok() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

#[tauri::command]
pub fn prune_clipboard_image_store(app: tauri::AppHandle, keep_ids: Vec<String>) -> Result<(), String> {
    let dir = clipboard_images_dir(&app).map_err(|e| e.to_string())?;
    let keep: HashSet<String> = keep_ids.into_iter().collect();
    prune_image_memory_cache(&keep);
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.ends_with(".preview.png") {
            let stem = name.strip_suffix(".preview.png").unwrap_or("");
            if !keep.contains(stem) {
                let _ = fs::remove_file(&path);
            }
            continue;
        }
        if !name.ends_with(".kchi") {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        if !keep.contains(stem) {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}
