use screenshots::image::{imageops::crop_imm, DynamicImage, ImageFormat, Rgba, RgbaImage};
use std::io::Cursor;

const MIN_WH: u32 = 8;

/// 所有显示器的虚拟桌面外接矩形（物理像素，与选区窗口对齐）。
pub fn virtual_screen_bounds() -> Result<(i32, i32, u32, u32), String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
    if screens.is_empty() {
        return Err("未找到可用显示器".to_string());
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for s in &screens {
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

/// 拼接虚拟桌面上指定矩形为 RGBA 图（与 `screenshots` 返回的显示器坐标一致）。
pub fn composite_virtual_region_rgba(
    gx: i32,
    gy: i32,
    width: u32,
    height: u32,
) -> Result<RgbaImage, String> {
    if width < MIN_WH || height < MIN_WH {
        return Err(format!("选区过小（至少 {}×{} 像素）", MIN_WH, MIN_WH));
    }

    let gw = width as i32;
    let gh = height as i32;
    let gx2 = gx + gw;
    let gy2 = gy + gh;

    let screens = screenshots::Screen::all().map_err(|e| format!("枚举显示器失败: {}", e))?;
    let mut pieces: Vec<(i32, i32, RgbaImage)> = Vec::new();

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
        let rgba = screen
            .capture_area(local_x, local_y, iw, ih)
            .map_err(|e| format!("截取区域失败: {}", e))?;
        let ox = ix1 - gx;
        let oy = iy1 - gy;
        pieces.push((ox, oy, rgba));
    }

    if pieces.is_empty() {
        return Err("所选区域不在任何显示器内".to_string());
    }

    let mut canvas = RgbaImage::new(width, height);
    for p in canvas.pixels_mut() {
        *p = Rgba([0u8, 0u8, 0u8, 0u8]);
    }
    for (ox, oy, piece) in pieces {
        for (px, py, pixel) in piece.enumerate_pixels() {
            let cx = ox + px as i32;
            let cy = oy + py as i32;
            if cx >= 0 && cy >= 0 && (cx as u32) < width && (cy as u32) < height {
                canvas.put_pixel(cx as u32, cy as u32, *pixel);
            }
        }
    }

    Ok(canvas)
}

/// 整屏虚拟桌面位图（打开选区前缓存，选区坐标按视口比例映射到此图，对齐「先截全屏再裁剪」流程）。
pub fn capture_virtual_desktop_rgba() -> Result<RgbaImage, String> {
    let (vx, vy, vw, vh) = virtual_screen_bounds()?;
    composite_virtual_region_rgba(vx, vy, vw, vh)
}

/// 将选区窗口内的矩形（CSS 像素）映射到缓存图坐标并裁剪；`viewport_w/h` 为 `window.innerWidth/Height`。
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
