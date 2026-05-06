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
    if crate::launcher::uwp::is_shell_apps_folder_uri(path) {
        return windows_shell_icon_data_url(path);
    }
    let b64 = windows_icons::get_icon_base64_by_path(path).ok()?;
    Some(format!("data:image/png;base64,{b64}"))
}

/// 通过 `IShellItemImageFactory::GetImage` 拉 `shell:AppsFolder\<AppID>` 的图标，
/// 这是 Windows 推荐的 UWP / MSIX 应用取图标方式（`SHGetFileInfo` 对这种 shell URI 不工作）。
///
/// 64×64 是开始菜单常用 logo 尺寸；`RESIZETOFIT | BIGGERSIZEOK` 让 shell 优先返回不小于此尺寸的清晰 logo，
/// 再由我们按需缩放（实际像素由 logo 资源决定，可能大于 64）。HBITMAP -> BGRA -> PNG -> base64。
#[cfg(target_os = "windows")]
fn windows_shell_icon_data_url(path: &str) -> Option<String> {
    use base64::Engine;
    use image::codecs::png::PngEncoder;
    use image::ImageEncoder;
    use std::cell::Cell;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::SIZE;
    use windows::Win32::Graphics::Gdi::{
        DeleteObject, GetDIBits, GetDC, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP, HGDIOBJ,
    };
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{
        IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK,
        SIIGBF_RESIZETOFIT,
    };

    // 每个调用线程一次性 CoInit；失败码（含 `RPC_E_CHANGED_MODE`）忽略，证明已被其它栈初始化过。
    thread_local! {
        static COM_INITED: Cell<bool> = const { Cell::new(false) };
    }
    COM_INITED.with(|c| {
        if !c.get() {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            }
            c.set(true);
        }
    });

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let factory: IShellItemImageFactory =
        unsafe { SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None) }.ok()?;
    let size = SIZE { cx: 64, cy: 64 };
    let hbitmap: HBITMAP = unsafe {
        factory
            .GetImage(size, SIIGBF_RESIZETOFIT | SIIGBF_BIGGERSIZEOK)
            .ok()?
    };

    // 用 RAII 守卫确保任何 ? / 早返回都释放 GDI 对象，避免把 HBITMAP 泄漏到进程结束。
    struct HBitmapGuard(HBITMAP);
    impl Drop for HBitmapGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(HGDIOBJ(self.0 .0));
            }
        }
    }
    let _guard = HBitmapGuard(hbitmap);

    let mut bm = BITMAP::default();
    let n = unsafe {
        GetObjectW(
            HGDIOBJ(hbitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut _ as *mut _),
        )
    };
    if n == 0 {
        return None;
    }
    let width = bm.bmWidth;
    let height = bm.bmHeight.abs();
    if width <= 0 || height <= 0 {
        return None;
    }
    let pixel_count = (width as usize) * (height as usize);
    let mut buf = vec![0u8; pixel_count * 4];

    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // 负值：top-down DIB，便于直接喂给 PNG 编码器。
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: Default::default(),
    };
    let hdc = unsafe { GetDC(None) };
    let ok = unsafe {
        GetDIBits(
            hdc,
            hbitmap,
            0,
            height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        )
    };
    unsafe {
        ReleaseDC(None, hdc);
    }
    if ok == 0 {
        return None;
    }

    // GDI 给的是 BGRA，PNG 期望 RGBA：交换每像素 R/B。
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
    }

    let mut png_buf: Vec<u8> = Vec::new();
    PngEncoder::new(&mut png_buf)
        .write_image(
            &buf,
            width as u32,
            height as u32,
            image::ExtendedColorType::Rgba8,
        )
        .ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png_buf);
    Some(format!("data:image/png;base64,{b64}"))
}

#[tauri::command]
pub fn get_app_icon_data_url(path: String) -> Option<String> {
    resolve_icon_data_url(&path)
}

/// 批量解析多条路径的图标 data URL：前端在结果集变更时一次性预拉取整列，
/// 把 N 次 IPC 往返合并成一次；命中缓存的项不会重复解析。
/// 返回数组与入参 `paths` 一一对应；失败/无效项位为 `None`。
#[tauri::command]
pub fn get_app_icons_data_url(paths: Vec<String>) -> Vec<Option<String>> {
    use rayon::prelude::*;
    paths
        .par_iter()
        .map(|p| resolve_icon_data_url(p))
        .collect()
}

fn resolve_icon_data_url(path: &str) -> Option<String> {
    let path = path.trim();
    if path.is_empty() {
        return None;
    }
    // `shell:AppsFolder\...` 是 Windows shell 的虚拟路径，磁盘上不存在；不能走 `Path::exists` 拦截。
    let is_shell_uri = {
        #[cfg(target_os = "windows")]
        {
            crate::launcher::uwp::is_shell_apps_folder_uri(path)
        }
        #[cfg(not(target_os = "windows"))]
        {
            false
        }
    };
    if !is_shell_uri && !Path::new(path).exists() {
        return None;
    }
    if let Some(cached) = app_icon_cache_get(path) {
        return Some(cached);
    }
    let data_url = {
        #[cfg(target_os = "macos")]
        {
            macos_app_icon_data_url(path)
        }
        #[cfg(target_os = "windows")]
        {
            windows_app_icon_data_url(path)
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            None::<String>
        }
    }?;
    app_icon_cache_put(path.to_string(), data_url.clone());
    Some(data_url)
}
