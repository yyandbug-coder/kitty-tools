//! macOS：使用 ScreenCaptureKit `capture_image_in_rect` 截取；系统 15.2+。
//! 全桌路径与「仅选区」路径均经同一套归一化 + 长边限制。
//!
//! 交互优化：**截图翻译**在框选时不需要事先抓全屏（遮罩为透明、桌面实时可见）；
//! 在确认选区、**先隐藏选区层**后仅对选定 CGRect 做 SCK，像素量小、首帧响应快，也避免把压暗/选框采进位图。

use screenshots::image::{
    imageops::{resize, FilterType},
    RgbaImage,
};
use screencapturekit::cg::CGRect;
use screencapturekit::screenshot_manager::SCScreenshotManager;

/// 默认长边上限（与百度图片翻译 4 MB 上限大致兼容；细字 OCR 仍可调高）。
const DEFAULT_MAX_LONG_EDGE: u32 = 2560;
/// 当 OCR 提供方对图片大小有更宽容上限（如 Google Vision 20MB / OpenAI Vision 较大）时，
/// 选用更大长边以保留小字细节，提升 OCR 准确度。
const HIGH_QUALITY_MAX_LONG_EDGE: u32 = 4096;
const MIN_SELECTION_LOGICAL: f64 = 8.0;

/// 根据 provider 选择长边上限：
/// - `baidu`：百度文本翻译图片接口约 4MB，沿用 2560；
/// - 其它（google / openai / youdao 等）：放宽到 4096，避免压缩破坏小字 OCR。
pub fn max_long_edge_for_provider(provider: &str) -> u32 {
    match provider {
        "baidu" => DEFAULT_MAX_LONG_EDGE,
        _ => HIGH_QUALITY_MAX_LONG_EDGE,
    }
}

/// 将 SCK 返回的 CG 位图压到 `logical_w × logical_h`（点），并做长边限制（与全桌策略一致）
fn sc_cgimage_to_rgba(
    cg: &screencapturekit::screenshot_manager::CGImage,
    logical_w: u32,
    logical_h: u32,
    max_long_edge: u32,
) -> Result<RgbaImage, String> {
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

    if img.width() != logical_w || img.height() != logical_h {
        img = resize(&img, logical_w, logical_h, FilterType::Triangle);
    }

    let tw = img.width();
    let th = img.height();
    let long = tw.max(th);
    if max_long_edge > 0 && long > max_long_edge {
        let scale = f64::from(max_long_edge) / f64::from(long);
        let nw = ((f64::from(tw) * scale).round() as u32).max(1);
        let nh = ((f64::from(th) * scale).round() as u32).max(1);
        img = resize(&img, nw, nh, FilterType::Triangle);
    }

    Ok(img)
}

/// 在隐藏选区层之后，按与原来 `crop_from_viewport_mapping` 一致的几何关系只截选区（全局点坐标系）。
/// `max_long_edge`：由调用方按 provider 传入；0 表示不做长边限制。
pub fn capture_overlay_selection_sck(
    vx: i32,
    vy: i32,
    vw: u32,
    vh: u32,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    viewport_w: f64,
    viewport_h: f64,
    max_long_edge: u32,
) -> Result<RgbaImage, String> {
    if viewport_w <= 0.0 || viewport_h <= 0.0 {
        return Err("视口尺寸无效".to_string());
    }
    // 与 slice `crop_from_viewport_mapping` 线性映射到同一全桌矩形
    let sub_w = (w / viewport_w) * f64::from(vw);
    let sub_h = (h / viewport_h) * f64::from(vh);
    if sub_w < MIN_SELECTION_LOGICAL || sub_h < MIN_SELECTION_LOGICAL {
        return Err(format!(
            "选区过小（至少 {}×{} 点）",
            MIN_SELECTION_LOGICAL, MIN_SELECTION_LOGICAL
        ));
    }

    let sub_x = f64::from(vx) + (x / viewport_w) * f64::from(vw);
    let sub_y = f64::from(vy) + (y / viewport_h) * f64::from(vh);

    let rect = CGRect::new(sub_x, sub_y, sub_w, sub_h);
    let out_w = (sub_w.round() as u32).max(8);
    let out_h = (sub_h.round() as u32).max(8);

    let cg = SCScreenshotManager::capture_image_in_rect(rect)
        .map_err(|e| format!("ScreenCaptureKit(选区): {:?}", e))?;
    sc_cgimage_to_rgba(&cg, out_w, out_h, max_long_edge)
}
