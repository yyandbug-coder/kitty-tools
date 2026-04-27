//! macOS：使用 ScreenCaptureKit `capture_image_in_rect` 单次截取虚拟桌面（系统 15.2+）。
//! 比 `CGWindowListCreateImage`（screenshots 库）快得多，与 Bob 等工具同类实现。

use screenshots::image::{
    imageops::{resize, FilterType},
    RgbaImage,
};
use screencapturekit::cg::CGRect;
use screencapturekit::screenshot_manager::SCScreenshotManager;

pub fn capture_full_desktop_sck(vx: i32, vy: i32, vw: u32, vh: u32) -> Result<RgbaImage, String> {
    let rect = CGRect::new(vx as f64, vy as f64, vw as f64, vh as f64);
    let cg = SCScreenshotManager::capture_image_in_rect(rect)
        .map_err(|e| format!("ScreenCaptureKit: {:?}", e))?;

    let w = cg.width();
    let h = cg.height();
    let data = cg
        .rgba_data()
        .map_err(|e| format!("ScreenCaptureKit 像素: {:?}", e))?;

    let expected = w.saturating_mul(h).saturating_mul(4);
    if data.len() != expected {
        return Err(format!(
            "截图像素长度异常: got {} expect {}",
            data.len(),
            expected
        ));
    }

    let mut img = RgbaImage::from_raw(w as u32, h as u32, data)
        .ok_or_else(|| "RgbaImage::from_raw 失败".to_string())?;

    if img.width() != vw || img.height() != vh {
        img = resize(&img, vw, vh, FilterType::Triangle);
    }

    Ok(img)
}
