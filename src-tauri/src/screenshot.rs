use screenshots::image::{DynamicImage, ImageFormat, RgbaImage};
use std::io::Cursor;

#[cfg(not(target_os = "macos"))]
use screenshots::image::{
    imageops::{crop_imm, overlay, resize, FilterType},
    Rgba, RgbaImage,
};
#[cfg(not(target_os = "macos"))]
use rayon::prelude::*;

#[cfg(not(target_os = "macos"))]
const MIN_WH: u32 = 8;

fn bounds_from_screens(screens: &[screenshots::Screen]) -> Result<(i32, i32, u32, u32), String> {
    if screens.is_empty() {
        return Err("未找到可用显示器".to_string());
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for s in screens {
        let d = s.display_info;
        min_x = min_x.min(d.x);
        min_y = min_y.min(d.y);
        max_x = max_x.max(d.x + d.width as i32);
        max_y = max_y.max(d.y + d.height as i32);
    }
    Ok((
        min_x,
        min_y,
        (max_x - min_x) as u32,
        (max_y - min_y) as u32,
    ))
}

pub fn virtual_screen_bounds() -> Result<(i32, i32, u32, u32), String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
    bounds_from_screens(&screens)
}

// 以下仅 Windows / Linux：先全屏截入内存，再按视口比例裁剪。macOS 在选区确认后单帧 SCK，见 `screenshot_macos_sck`。

#[cfg(not(target_os = "macos"))]
struct CompositeJob {
    screen: screenshots::Screen,
    local_x: i32,
    local_y: i32,
    iw: u32,
    ih: u32,
    ox: i32,
    oy: i32,
}

#[cfg(not(target_os = "macos"))]
fn capture_and_normalize_job(job: CompositeJob) -> Result<(i32, i32, RgbaImage), String> {
    let CompositeJob {
        screen,
        local_x,
        local_y,
        iw,
        ih,
        ox,
        oy,
    } = job;
    let mut rgba = screen
        .capture_area(local_x, local_y, iw, ih)
        .map_err(|e| format!("截取区域失败: {}", e))?;
    if rgba.width() != iw || rgba.height() != ih {
        rgba = resize(&rgba, iw, ih, FilterType::Triangle);
    }
    Ok((ox, oy, rgba))
}

#[cfg(not(target_os = "macos"))]
pub fn composite_virtual_region_rgba(
    gx: i32,
    gy: i32,
    width: u32,
    height: u32,
    screens: &[screenshots::Screen],
) -> Result<RgbaImage, String> {
    if width < MIN_WH || height < MIN_WH {
        return Err(format!("选区过小（至少 {}×{} 像素）", MIN_WH, MIN_WH));
    }

    let gw = width as i32;
    let gh = height as i32;
    let gx2 = gx + gw;
    let gy2 = gy + gh;

    let mut jobs: Vec<CompositeJob> = Vec::new();
    for screen in screens {
        let d = screen.display_info;
        let sx2 = d.x + d.width as i32;
        let sy2 = d.y + d.height as i32;
        let ix1 = gx.max(d.x);
        let iy1 = gy.max(d.y);
        let ix2 = gx2.min(sx2);
        let iy2 = gy2.min(sy2);
        if ix1 >= ix2 || iy1 >= iy2 {
            continue;
        }
        let local_x = ix1 - d.x;
        let local_y = iy1 - d.y;
        let iw = (ix2 - ix1) as u32;
        let ih = (iy2 - iy1) as u32;
        let ox = ix1 - gx;
        let oy = iy1 - gy;
        jobs.push(CompositeJob {
            screen: *screen,
            local_x,
            local_y,
            iw,
            ih,
            ox,
            oy,
        });
    }

    if jobs.is_empty() {
        return Err("所选区域不在任何显示器内".to_string());
    }

    let mut pieces = Vec::with_capacity(jobs.len());
    if jobs.len() == 1 {
        pieces.push(capture_and_normalize_job(jobs.into_iter().next().unwrap())?);
    } else {
        let piece_results: Vec<Result<(i32, i32, RgbaImage), String>> =
            jobs.into_par_iter().map(capture_and_normalize_job).collect();
        for r in piece_results {
            pieces.push(r?);
        }
    }

    let mut canvas = RgbaImage::new(width, height);
    for p in canvas.pixels_mut() {
        *p = Rgba([0u8, 0u8, 0u8, 0u8]);
    }
    for (ox, oy, piece) in pieces {
        overlay(&mut canvas, &piece, ox as i64, oy as i64);
    }

    Ok(canvas)
}

/// 为选区准备：在 Windows / Linux 上先合成虚拟桌面一帧
#[cfg(not(target_os = "macos"))]
pub fn capture_virtual_desktop_rgba() -> Result<RgbaImage, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
    let (vx, vy, vw, vh) = bounds_from_screens(&screens)?;
    composite_virtual_region_rgba(vx, vy, vw, vh, &screens)
}

#[cfg(not(target_os = "macos"))]
pub fn crop_from_viewport_mapping(
    full: &RgbaImage,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_w: f64,
    viewport_h: f64,
) -> Result<RgbaImage, String> {
    if viewport_w <= 0.0 || viewport_h <= 0.0 {
        return Err("视口尺寸无效".to_string());
    }
    let img_w = full.width() as f64;
    let img_h = full.height() as f64;

    let left = (x / viewport_w * img_w).round().clamp(0.0, img_w - 1.0) as u32;
    let top = (y / viewport_h * img_h).round().clamp(0.0, img_h - 1.0) as u32;
    let mut cw = (width / viewport_w * img_w).round() as u32;
    let mut ch = (height / viewport_h * img_h).round() as u32;

    cw = cw.max(MIN_WH).min(full.width().saturating_sub(left));
    ch = ch.max(MIN_WH).min(full.height().saturating_sub(top));

    if cw < MIN_WH || ch < MIN_WH {
        return Err(format!("选区过小（至少 {}×{} 像素）", MIN_WH, MIN_WH));
    }

    Ok(crop_imm(full, left, top, cw, ch).to_image())
}

pub fn rgba_to_png(rgba: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    DynamicImage::ImageRgba8(rgba.clone())
        .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;
    Ok(buf)
}
