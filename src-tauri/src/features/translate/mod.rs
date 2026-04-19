mod baidu_creds;
mod clipboard;
mod config;
mod config_sqlite;
mod lang_detect;
mod ocr;
mod screenshot;
mod translate;
mod youdao;

use config::{load_config, save_config, AppConfig};
use ocr::OcrResult;
use reqwest::Client;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;
use tauri::Runtime;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::window::Color;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use translate::{TranslateRequest, TranslateResult};

static CURRENT_TRANSLATE_SHORTCUTS: Mutex<Option<(String, String)>> = Mutex::new(None);
const TRANSLATE_REGION_SELECT_LABEL: &str = "translate-region-select";

#[derive(Clone)]
enum RegionPending {
    Translate {
        source_lang: String,
        target_lang: String,
    },
}

#[derive(Clone)]
struct PendingTranslation {
    text: String,
    translated: String,
    error: Option<String>,
    loading: bool,
    /// 翻译引擎返回的源语言（用户选「自动检测」时供浮动窗展示）
    detected_source_lang: Option<String>,
}

pub struct AppState {
    client: Client,
    config: std::sync::Mutex<AppConfig>,
    /// 托盘左键单击延迟打开工作台时，与左键双击打开设置互斥（Windows 会先收到单击再收到双击）。
    tray_click_generation: Arc<AtomicU64>,
    suppress_next_floating_blur_hide: AtomicBool,
    pending_translation: Arc<Mutex<Option<PendingTranslation>>>,
    region_pending: Mutex<Option<RegionPending>>,
    /// 打开选区前缓存的整屏虚拟桌面图（与视口比例裁剪，参考 ScreenTranslator 先截全屏再 crop）。
    region_capture: Mutex<Option<screenshots::image::RgbaImage>>,
}

#[tauri::command]
pub async fn translate_text(
    state: tauri::State<'_, AppState>,
    request: TranslateRequest,
) -> Result<TranslateResult, String> {
    let (provider, creds, resolved) = {
        let cfg = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        let resolved = translate::resolve_translate_request(&request, &cfg);
        (
            cfg.translate_provider.clone(),
            translate::TranslateCreds::from_config(&cfg),
            resolved,
        )
    };

    translate::translate(&state.client, &resolved, &provider, &creds).await
}

/// 用当前界面快照发一条短句翻译，校验密钥与 API 是否可用（不写回磁盘配置）。
#[tauri::command]
async fn test_translate_connection(
    state: tauri::State<'_, AppState>,
    mut snapshot: AppConfig,
) -> Result<TranslateResult, String> {
    snapshot.translate_provider = snapshot.translate_provider.trim().to_string();
    let provider = snapshot.translate_provider.clone();
    let creds = translate::TranslateCreds::from_config(&snapshot);
    let request = TranslateRequest {
        text: "Hello".to_string(),
        source_lang: "en".to_string(),
        target_lang: "zh-CN".to_string(),
    };
    let resolved = translate::resolve_translate_request(&request, &snapshot);
    translate::translate(&state.client, &resolved, &provider, &creds).await
}

/// 打开划区截屏并完成「截图翻译」（选区结束后走 OCR + 翻译）。
#[tauri::command]
async fn start_screenshot_translate(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source_lang: String,
    target_lang: String,
) -> Result<(), String> {
    {
        let mut g = state
            .region_pending
            .lock()
            .map_err(|e| format!("region_pending lock: {}", e))?;
        *g = Some(RegionPending::Translate {
            source_lang,
            target_lang,
        });
    }
    if let Err(e) = prepare_and_show_region_overlay(&app, &state).await {
        let _ = clear_region_session(&state);
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
fn region_overlay_cancel(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let _ = clear_region_session(&state);
    hide_region_overlay(&app);
    Ok(())
}

#[tauri::command]
fn region_overlay_complete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<(), String> {
    let pending = {
        let mut g = state
            .region_pending
            .lock()
            .map_err(|e| format!("region_pending lock: {}", e))?;
        g.take()
    };

    let Some(mode) = pending else {
        hide_region_overlay(&app);
        let _ = clear_region_session(&state);
        return Ok(());
    };

    let full = {
        let mut cap = state
            .region_capture
            .lock()
            .map_err(|e| format!("region_capture lock: {}", e))?;
        cap.take()
            .ok_or_else(|| "截图缓存失效，请关闭选区后重试".to_string())
    };

    let full = match full {
        Ok(img) => img,
        Err(e) => {
            hide_region_overlay(&app);
            notify_screenshot_translate_ui(
                &app,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": e,
                }),
            );
            let _ = clear_region_session(&state);
            return Ok(());
        }
    };

    let cropped = match screenshot::crop_from_viewport_mapping(
        &full,
        x,
        y,
        width,
        height,
        viewport_width,
        viewport_height,
    ) {
        Ok(c) => c,
        Err(e) => {
            hide_region_overlay(&app);
            notify_screenshot_translate_ui(
                &app,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": e,
                }),
            );
            let _ = clear_region_session(&state);
            return Ok(());
        }
    };

    let png = match screenshot::rgba_to_png(&cropped) {
        Ok(p) => p,
        Err(e) => {
            hide_region_overlay(&app);
            notify_screenshot_translate_ui(
                &app,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": e,
                }),
            );
            let _ = clear_region_session(&state);
            return Ok(());
        }
    };

    hide_region_overlay(&app);

    let RegionPending::Translate {
        source_lang,
        target_lang,
    } = mode;

    spawn_screenshot_translate_pipeline(
        app.clone(),
        png,
        source_lang,
        target_lang,
    );
    Ok(())
}

#[tauri::command]
pub async fn translate_selection(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let selected_text = clipboard::get_selected_text()?;
    let pending = state.pending_translation.clone();

    let (provider, creds, request) = {
        let cfg = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        let raw = TranslateRequest {
            text: selected_text.clone(),
            source_lang: cfg.source_lang.clone(),
            target_lang: cfg.target_lang.clone(),
        };
        let request = translate::resolve_translate_request(&raw, &cfg);
        (
            cfg.translate_provider.clone(),
            translate::TranslateCreds::from_config(&cfg),
            request,
        )
    };

    {
        let mut p = pending.lock().unwrap();
        *p = Some(PendingTranslation {
            text: selected_text.clone(),
            translated: String::new(),
            error: None,
            loading: true,
            detected_source_lang: None,
        });
    }

    show_floating_window(&app)?;
    // 与划词快捷键一致：窗口已存在时可立刻进入加载态；首次冷启动仍由 floating_ready 根据 pending 重放
    let _ = app.emit("translate-selection-start", &selected_text);

    match translate::translate(&state.client, &request, &provider, &creds).await
 {
        Ok(result) => {
            {
                let mut p = pending.lock().unwrap();
                *p = Some(PendingTranslation {
                    text: selected_text.clone(),
                    translated: result.translated_text.clone(),
                    error: None,
                    loading: false,
                    detected_source_lang: Some(result.source_lang.clone()),
                });
            }
            let _ = app.emit(
                "translate-selection-result",
                serde_json::json!({
                    "text": selected_text,
                    "translated": result.translated_text,
                    "sourceLang": result.source_lang,
                }),
            );
            Ok(())
        }
        Err(e) => {
            {
                let mut p = pending.lock().unwrap();
                *p = Some(PendingTranslation {
                    text: selected_text.clone(),
                    translated: String::new(),
                    error: Some(e.clone()),
                    loading: false,
                    detected_source_lang: None,
                });
            }
            let _ = app.emit(
                "translate-selection-result",
                serde_json::json!({
                    "text": selected_text,
                    "translated": "",
                    "error": e,
                }),
            );
            Err(e)
        }
    }
}

fn do_translate_selection(app: &tauri::AppHandle) -> Result<(), String> {
    let selected_text = clipboard::get_selected_text()?;
    let state = app.state::<AppState>();
    let client = state.client.clone();
    let (provider, source_lang, target_lang, creds) = {
        let cfg = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        (
            cfg.translate_provider.clone(),
            cfg.source_lang.clone(),
            cfg.target_lang.clone(),
            translate::TranslateCreds::from_config(&cfg),
        )
    };

    let app_clone = app.clone();
    let text_clone = selected_text.clone();
    let pending = state.pending_translation.clone();

    {
        let mut p = pending.lock().unwrap();
        *p = Some(PendingTranslation {
            text: selected_text,
            translated: String::new(),
            error: None,
            loading: true,
            detected_source_lang: None,
        });
    }

    show_floating_window(app)?;
    let _ = app.emit("translate-selection-start", &text_clone);

    tauri::async_runtime::spawn(async move {
        let request = {
            let st = app_clone.state::<AppState>();
            let cfg = st.config.lock().unwrap();
            let raw = TranslateRequest {
                text: text_clone.clone(),
                source_lang,
                target_lang,
            };
            translate::resolve_translate_request(&raw, &cfg)
        };

        match translate::translate(&client, &request, &provider, &creds).await
        {
            Ok(result) => {
                {
                    let mut p = pending.lock().unwrap();
                    *p = Some(PendingTranslation {
                        text: text_clone.clone(),
                        translated: result.translated_text.clone(),
                        error: None,
                        loading: false,
                        detected_source_lang: Some(result.source_lang.clone()),
                    });
                }
                let _ = app_clone.emit(
                    "translate-selection-result",
                    serde_json::json!({
                        "text": text_clone,
                        "translated": result.translated_text,
                        "sourceLang": result.source_lang,
                    }),
                );
            }
            Err(e) => {
                {
                    let mut p = pending.lock().unwrap();
                    *p = Some(PendingTranslation {
                        text: text_clone.clone(),
                        translated: String::new(),
                        error: Some(e.clone()),
                        loading: false,
                        detected_source_lang: None,
                    });
                }
                let _ = app_clone.emit(
                    "translate-selection-result",
                    serde_json::json!({
                        "text": text_clone,
                        "translated": "",
                        "error": e,
                    }),
                );
            }
        }
    });

    Ok(())
}

/// 截图翻译：选「百度翻译」时走开放平台「图片翻译」；选「有道翻译」时走智云通用 OCR 再文本翻译；其它引擎先 OCR（百度 / Google 等）再文本翻译。
fn spawn_screenshot_translate_pipeline(
    app: tauri::AppHandle,
    image_data: Vec<u8>,
    source_lang: String,
    target_lang: String,
) {
    let state = app.state::<AppState>();
    let client = state.client.clone();
    let pending = state.pending_translation.clone();
    {
        let mut p = pending.lock().unwrap();
        *p = Some(PendingTranslation {
            text: String::new(),
            translated: String::new(),
            error: None,
            loading: true,
            detected_source_lang: None,
        });
    }
    if let Err(e) = show_floating_window(&app) {
        eprintln!("无法显示截图翻译窗口: {}", e);
    }
    // 浮动窗立即进入加载态：百度图片翻译等路径此前无中间事件，避免译文区长时间空白
    let _ = app.emit("translate-selection-start", "");

    let (
        provider,
        baidu_app_id,
        baidu_secret,
        google_cloud_api_key,
        google_vision_api_url,
        baidu_ocr_api_key,
        baidu_ocr_secret_key,
        baidu_ocr_api_base_url,
        youdao_app_key,
        youdao_app_secret,
        creds,
    ) = {
        let cfg = state.config.lock().unwrap();
        (
            cfg.translate_provider.clone(),
            cfg.baidu.app_id.clone(),
            cfg.baidu.secret.clone(),
            cfg.google.api_key.clone(),
            cfg.google.vision_api_url.clone(),
            cfg.baidu.ocr_api_key.clone(),
            cfg.baidu.ocr_secret_key.clone(),
            cfg.baidu.ocr_aip_base_url.clone(),
            cfg.youdao.app_key.clone(),
            cfg.youdao.app_secret.clone(),
            translate::TranslateCreds::from_config(&cfg),
        )
    };

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if provider == "baidu" {
            match translate::baidu_translate_screenshot_image(
                &client,
                &image_data,
                &source_lang,
                &target_lang,
                &baidu_app_id,
                &baidu_secret,
            )
            .await
            {
                Ok(result) => {
                    notify_screenshot_translate_ui(
                        &app_clone,
                        serde_json::json!({
                            "sourceText": result.source_text,
                            "translatedText": result.translated_text,
                            "sourceLang": result.source_lang,
                            "targetLang": result.target_lang,
                            "provider": result.provider,
                        }),
                    );
                }
                Err(e) => {
                    eprintln!("百度图片翻译: {}", e);
                    notify_screenshot_translate_ui(
                        &app_clone,
                        serde_json::json!({
                            "sourceText": "",
                            "translatedText": "",
                            "error": e,
                        }),
                    );
                }
            }
            return;
        }

        let ocr_result = match ocr::recognize_text(
            &client,
            &image_data,
            &provider,
            &google_cloud_api_key,
            &google_vision_api_url,
            &baidu_ocr_api_key,
            &baidu_ocr_secret_key,
            &baidu_ocr_api_base_url,
            &youdao_app_key,
            &youdao_app_secret,
        )
        .await
        {
            Ok(r) => r,
            Err(e) => {
                eprintln!("OCR error: {}", e);
                notify_screenshot_translate_ui(
                    &app_clone,
                    serde_json::json!({
                        "sourceText": "",
                        "translatedText": "",
                        "error": e,
                    }),
                );
                return;
            }
        };

        let text_trimmed = ocr_result.text.trim();
        if text_trimmed.is_empty() {
            notify_screenshot_translate_ui(
                &app_clone,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": "截图中未识别到文字",
                }),
            );
            return;
        }

        let text_owned = text_trimmed.to_string();

        // 与划词一致：先有原文，再调文本翻译 API，最后 emit 同一套 translate-selection-result
        {
            let mut p = pending.lock().unwrap();
            *p = Some(PendingTranslation {
                text: text_owned.clone(),
                translated: String::new(),
                error: None,
                loading: true,
                detected_source_lang: None,
            });
        }
        // OCR 后窗口一般已就绪；与 do_translate_selection 相同，先进入加载态并展示识别原文
        let _ = app_clone.emit("translate-selection-start", &text_owned);

        let request = {
            let st = app_clone.state::<AppState>();
            let cfg = st.config.lock().unwrap();
            let raw = TranslateRequest {
                text: text_owned.clone(),
                source_lang: source_lang.clone(),
                target_lang: target_lang.clone(),
            };
            translate::resolve_translate_request(&raw, &cfg)
        };

        match translate::translate(&client, &request, &provider, &creds).await
        {
            Ok(result) => {
                {
                    let mut p = pending.lock().unwrap();
                    *p = Some(PendingTranslation {
                        text: text_owned.clone(),
                        translated: result.translated_text.clone(),
                        error: None,
                        loading: false,
                        detected_source_lang: Some(result.source_lang.clone()),
                    });
                }
                let _ = app_clone.emit(
                    "translate-selection-result",
                    serde_json::json!({
                        "text": text_owned,
                        "translated": result.translated_text,
                        "sourceLang": result.source_lang,
                    }),
                );
            }
            Err(e) => {
                {
                    let mut p = pending.lock().unwrap();
                    *p = Some(PendingTranslation {
                        text: text_owned.clone(),
                        translated: String::new(),
                        error: Some(e.clone()),
                        loading: false,
                        detected_source_lang: None,
                    });
                }
                let _ = app_clone.emit(
                    "translate-selection-result",
                    serde_json::json!({
                        "text": text_owned,
                        "translated": "",
                        "error": e,
                    }),
                );
            }
        }
    });
}

fn do_screenshot_translate(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (source_lang, target_lang) = {
        let cfg = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        (cfg.source_lang.clone(), cfg.target_lang.clone())
    };
    {
        let mut g = state
            .region_pending
            .lock()
            .map_err(|e| format!("region_pending lock: {}", e))?;
        *g = Some(RegionPending::Translate {
            source_lang,
            target_lang,
        });
    }

    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_clone.state::<AppState>();
        if let Err(e) = prepare_and_show_region_overlay(&app_clone, &state).await {
            eprintln!("Screenshot translate error: {}", e);
            let _ = clear_region_session(&state);
            notify_screenshot_translate_ui(
                &app_clone,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": e,
                }),
            );
        }
    });
    Ok(())
}

fn region_select_url() -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            "http://localhost:1420/translate-region-select.html"
                .parse()
                .expect("invalid region-select dev url"),
        )
    } else {
        tauri::WebviewUrl::App("translate-region-select.html".into())
    }
}

fn clear_region_session(state: &AppState) -> Result<(), String> {
    {
        let mut g = state
            .region_pending
            .lock()
            .map_err(|e| format!("region_pending lock: {}", e))?;
        *g = None;
    }
    {
        let mut c = state
            .region_capture
            .lock()
            .map_err(|e| format!("region_capture lock: {}", e))?;
        *c = None;
    }
    Ok(())
}

fn hide_region_overlay(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window(TRANSLATE_REGION_SELECT_LABEL) {
        let _ = w.hide();
    }
}

/// 推送截图翻译结果到划词浮动窗（与划词翻译共用 UI）。
fn notify_screenshot_translate_ui(app: &tauri::AppHandle, payload: serde_json::Value) {
    let source = payload
        .get("sourceText")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let translated = payload
        .get("translatedText")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let err_opt = payload
        .get("error")
        .and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())));
    let detected_opt = payload
        .get("sourceLang")
        .and_then(|v| v.as_str())
        .map(String::from);

    let state = app.state::<AppState>();
    let pending = state.pending_translation.clone();
    {
        let mut p = pending.lock().unwrap();
        *p = Some(PendingTranslation {
            text: source.clone(),
            translated: translated.clone(),
            error: err_opt.clone(),
            loading: false,
            detected_source_lang: detected_opt.clone(),
        });
    }

    if let Err(e) = show_floating_window(app) {
        eprintln!("无法显示划词/截图结果窗口: {}", e);
    }

    let ev = if let Some(ref err) = err_opt {
        serde_json::json!({
            "text": source,
            "translated": translated,
            "error": err,
        })
    } else {
        serde_json::json!({
            "text": source,
            "translated": translated,
            "sourceLang": detected_opt,
        })
    };
    let _ = app.emit("translate-selection-result", ev);
}

/// 在阻塞线程中截取虚拟桌面，避免卡住主线程导致窗口「未响应」。
async fn prepare_and_show_region_overlay(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), String> {
    let rgba = tokio::task::spawn_blocking(|| screenshot::capture_virtual_desktop_rgba())
        .await
        .map_err(|e| format!("截图线程异常: {}", e))??;
    apply_region_capture_and_show(app, state, rgba)
}

fn apply_region_capture_and_show(
    app: &tauri::AppHandle,
    state: &AppState,
    rgba: screenshots::image::RgbaImage,
) -> Result<(), String> {
    {
        let mut cap = state
            .region_capture
            .lock()
            .map_err(|e| format!("region_capture lock: {}", e))?;
        *cap = Some(rgba);
    }
    show_region_overlay_window_only(app)
}

/// 选区窗口始终先以不可见方式创建，避免 WebView 首帧白底与 DWM 阴影在 `show` 瞬间闪屏。
fn get_or_create_region_select_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(TRANSLATE_REGION_SELECT_LABEL) {
        return Ok(w);
    }
    tauri::WebviewWindow::builder(app, TRANSLATE_REGION_SELECT_LABEL, region_select_url())
        .title("")
        .inner_size(400.0, 300.0)
        .position(0.0, 0.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .background_color(Color::from((0u8, 0u8, 0u8, 0u8)))
        .visible(false)
        .build()
        .map_err(|e| format!("创建选区窗口失败: {}", e))
}

fn show_region_overlay_window_only(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::{PhysicalPosition, PhysicalSize, Position, Size};

    let w = get_or_create_region_select_window(app)?;
    let (vx, vy, vw, vh) = screenshot::virtual_screen_bounds()?;
    w.set_position(Position::Physical(PhysicalPosition::new(vx, vy)))
        .map_err(|e| e.to_string())?;
    w.set_size(Size::Physical(PhysicalSize::new(vw, vh)))
        .map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

fn floating_window_url() -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            "http://localhost:1420/translate-floating.html"
                .parse()
                .expect("invalid floating dev url"),
        )
    } else {
        tauri::WebviewUrl::App("translate-floating.html".into())
    }
}

fn translate_workspace_url() -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            "http://localhost:1420/translate-workspace.html"
                .parse()
                .expect("invalid translate-workspace dev url"),
        )
    } else {
        tauri::WebviewUrl::App("translate-workspace.html".into())
    }
}

fn get_or_create_translate_workspace_window(
    app: &tauri::AppHandle,
) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("translate-workspace") {
        return Ok(w);
    }

    let window = tauri::WebviewWindow::builder(app, "translate-workspace", translate_workspace_url())
        .title("Kitty 翻译 · 工作台")
        .inner_size(680.0, 520.0)
        .min_inner_size(560.0, 400.0)
        .resizable(true)
        .decorations(true)
        .center()
        .visible(false)
        .build()
        .map_err(|e| format!("创建翻译工作台窗口失败: {}", e))?;

    let w_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w_clone.hide();
        }
    });

    Ok(window)
}

fn show_translate_workspace(app: &tauri::AppHandle) -> Result<(), String> {
    let window = get_or_create_translate_workspace_window(app)?;
    window
        .show()
        .map_err(|e| format!("显示翻译工作台失败: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("聚焦翻译工作台失败: {}", e))?;
    Ok(())
}

fn save_current_config(state: &AppState) -> Result<(), String> {
    let mut guard = state
        .config
        .lock()
        .map_err(|e| format!("Config lock error: {}", e))?;
    let stored = save_config(&guard)?;
    *guard = stored;
    Ok(())
}

fn register_floating_window_handlers(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    let app_handle = app.clone();
    let window_handle = window.clone();
    // 避免创建/显示过程中先收到 `Focused(false)` 就把窗口 hide，导致首次只见白屏或闪一下消失
    let had_true_focus = Arc::new(AtomicBool::new(false));

    window.on_window_event(move |event| {
        let state = app_handle.state::<AppState>();

        match event {
            tauri::WindowEvent::Moved(position) => {
                if let Ok(mut config) = state.config.lock() {
                    config.floating_window_x = Some(position.x);
                    config.floating_window_y = Some(position.y);
                }
            }
            tauri::WindowEvent::Focused(true) => {
                had_true_focus.store(true, Ordering::SeqCst);
            }
            tauri::WindowEvent::Focused(false) => {
                let pinned = state
                    .config
                    .lock()
                    .map(|config| config.floating_pinned)
                    .unwrap_or(false);
                let suppress_hide = state
                    .suppress_next_floating_blur_hide
                    .swap(false, Ordering::SeqCst);

                let _ = save_current_config(&state);

                if !pinned && !suppress_hide && had_true_focus.load(Ordering::SeqCst) {
                    let _ = window_handle.hide();
                }
            }
            tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                let _ = save_current_config(&state);
            }
            _ => {}
        }
    });
}

/// 启动时预载：不可见创建，让 WebView 与前端在首次 `show` 前完成加载，避免首帧整页白底。
fn get_or_create_floating_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("translate-floating") {
        return Ok(w);
    }

    let state = app.state::<AppState>();
    let (saved_x, saved_y) = {
        let config = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        (config.floating_window_x, config.floating_window_y)
    };

    let mut builder = tauri::WebviewWindow::builder(app, "translate-floating", floating_window_url());
    builder = builder
        .title("Kitty 翻译 · 划词")
        .inner_size(680.0, 460.0)
        .min_inner_size(520.0, 360.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false);

    builder = if let (Some(x), Some(y)) = (saved_x, saved_y) {
        builder.position(x as f64, y as f64)
    } else {
        builder.center()
    };

    let window = builder
        .build()
        .map_err(|e| format!("Create floating window error: {}", e))?;

    register_floating_window_handlers(&window, app);
    Ok(window)
}

fn show_floating_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = get_or_create_floating_window(app)?;
    window
        .show()
        .map_err(|e| format!("Show window error: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Focus window error: {}", e))?;
    Ok(())
}

fn show_main_settings(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn show_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    show_main_settings(&app);
    Ok(())
}

#[tauri::command]
fn show_translate_workspace_window(app: tauri::AppHandle) -> Result<(), String> {
    show_translate_workspace(&app)
}

#[tauri::command]
fn get_config(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    state
        .config
        .lock()
        .map(|c| c.clone())
        .map_err(|e| format!("Config lock error: {}", e))
}

fn validate_hotkey_pair(selection: &str, screenshot: &str) -> Result<(), String> {
    let a = selection.trim();
    let b = screenshot.trim();
    if a.is_empty() || b.is_empty() {
        return Err("快捷键不能为空".to_string());
    }
    if a.eq_ignore_ascii_case(b) {
        return Err("两个快捷键不能相同".to_string());
    }
    Shortcut::from_str(a).map_err(|e| format!("划词快捷键无效：{}", e))?;
    Shortcut::from_str(b).map_err(|e| format!("截图快捷键无效：{}", e))?;
    Ok(())
}

fn validate_hotkeys_against_clipboard(
    app: &tauri::AppHandle,
    selection: &str,
    screenshot: &str,
) -> Result<(), String> {
    let Some(clipboard_shortcut) = crate::features::clipboard_history::current_clipboard_shortcut() else {
        return Ok(());
    };
    let clipboard_shortcut = clipboard_shortcut.trim();
    if clipboard_shortcut.is_empty() {
        return Ok(());
    }

    if clipboard_shortcut.eq_ignore_ascii_case(selection.trim()) {
        return Err("划词快捷键不能与历史记录面板快捷键相同".to_string());
    }
    if clipboard_shortcut.eq_ignore_ascii_case(screenshot.trim()) {
        return Err("截图快捷键不能与历史记录面板快捷键相同".to_string());
    }

    let _ = app;
    Ok(())
}

fn sync_launch_on_startup(app: &tauri::AppHandle, want_enabled: bool) {
    let mgr = app.autolaunch();
    let current = match mgr.is_enabled() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("读取开机自启状态失败：{}", e);
            return;
        }
    };
    if current == want_enabled {
        return;
    }
    let r = if want_enabled {
        mgr.enable()
    } else {
        mgr.disable()
    };
    if let Err(e) = r {
        eprintln!("更新开机自启失败：{}", e);
    }
}

fn sync_global_hotkeys(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let gs = app.global_shortcut();
    let s1 = config.hotkey_selection.trim();
    let s2 = config.hotkey_screenshot.trim();
    let mut current = CURRENT_TRANSLATE_SHORTCUTS
        .lock()
        .map_err(|e| format!("shortcut state lock: {}", e))?;
    let previous = current.clone();

    if previous
        .as_ref()
        .is_some_and(|(prev_s1, prev_s2)| prev_s1 == s1 && prev_s2 == s2)
    {
        return Ok(());
    }

    let restore_previous = |previous: &Option<(String, String)>| {
        if let Some((prev_s1, prev_s2)) = previous {
            let _ = gs.register(prev_s1.as_str());
            let _ = gs.register(prev_s2.as_str());
        }
    };

    if let Some((prev_s1, prev_s2)) = previous.as_ref() {
        if let Ok(shortcut) = Shortcut::from_str(prev_s1) {
            let _ = gs.unregister(shortcut);
        }
        if let Ok(shortcut) = Shortcut::from_str(prev_s2) {
            let _ = gs.unregister(shortcut);
        }
    }

    if let Err(error) = gs.register(s1) {
        restore_previous(&previous);
        return Err(format!("注册划词快捷键失败：{}（格式错误或已被占用）", error));
    }
    if let Err(error) = gs.register(s2) {
        if let Ok(shortcut) = Shortcut::from_str(s1) {
            let _ = gs.unregister(shortcut);
        }
        restore_previous(&previous);
        return Err(format!("注册截图快捷键失败：{}（格式错误或已被占用）", error));
    }

    *current = Some((s1.to_string(), s2.to_string()));
    Ok(())
}

/// 与 `TrayIconBuilder::with_id` 一致，便于保存设置后 `set_menu` 刷新快捷键展示。
const TRAY_ICON_INSTANCE_ID: &str = "kitty-tray";

fn hotkey_display_for_tray(h: &str) -> String {
    let mut t = h.trim().to_string();
    #[cfg(target_os = "macos")]
    {
        t = t.replace("CmdOrCtrl", "\u{2318}");
        t = t.replace("CommandOrControl", "\u{2318}");
        t = t.replace("Alt", "\u{2325}");
    }
    #[cfg(not(target_os = "macos"))]
    {
        t = t.replace("CmdOrCtrl", "Ctrl");
        t = t.replace("CommandOrControl", "Ctrl");
    }
    t.replace('+', " + ")
}

fn build_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cfg: &AppConfig,
) -> Result<Menu<R>, String> {
    let sel_label = format!(
        "划词翻译\t{}",
        hotkey_display_for_tray(&cfg.hotkey_selection)
    );
    let cap_label = format!(
        "截图翻译\t{}",
        hotkey_display_for_tray(&cfg.hotkey_screenshot)
    );
    let tray_settings =
        MenuItem::with_id(app, "tray_settings", "打开设置", true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let tray_workspace =
        MenuItem::with_id(app, "tray_workspace", "翻译工作台", true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let tray_selection =
        MenuItem::with_id(app, "tray_selection", sel_label.as_str(), true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let tray_screenshot =
        MenuItem::with_id(app, "tray_screenshot", cap_label.as_str(), true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let tray_quit =
        MenuItem::with_id(app, "tray_quit", "退出", true, None::<&str>).map_err(|e| e.to_string())?;
    Menu::with_items(
        app,
        &[
            &tray_settings,
            &tray_workspace,
            &tray_selection,
            &tray_screenshot,
            &sep,
            &tray_quit,
        ],
    )
    .map_err(|e| e.to_string())
}

fn refresh_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    cfg: &AppConfig,
) -> Result<(), String> {
    let menu = build_tray_menu(app, cfg)?;
    let Some(tray) = app.tray_by_id(TRAY_ICON_INSTANCE_ID) else {
        return Ok(());
    };
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_config_cmd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    mut config: AppConfig,
) -> Result<(), String> {
    config.translate_provider = config.translate_provider.trim().to_string();
    validate_hotkey_pair(&config.hotkey_selection, &config.hotkey_screenshot)?;
    validate_hotkeys_against_clipboard(&app, &config.hotkey_selection, &config.hotkey_screenshot)?;
    let previous = state
        .config
        .lock()
        .map_err(|e| format!("Config lock error: {}", e))?
        .clone();
    if let Err(e) = sync_global_hotkeys(&app, &config) {
        let _ = sync_global_hotkeys(&app, &previous);
        return Err(e);
    }
    let stored = save_config(&config)?;
    sync_launch_on_startup(&app, stored.launch_on_startup);
    if let Err(e) = refresh_tray_menu(&app, &stored) {
        eprintln!("更新托盘菜单快捷键展示失败：{}", e);
    }
    *state
        .config
        .lock()
        .map_err(|e| format!("Config lock error: {}", e))? = stored;
    let _ = app.emit("config-updated", serde_json::json!({}));
    Ok(())
}

#[tauri::command]
async fn ocr_image(
    state: tauri::State<'_, AppState>,
    image_data: Vec<u8>,
) -> Result<OcrResult, String> {
    let (
        provider,
        google_cloud_api_key,
        google_vision_api_url,
        baidu_ocr_api_key,
        baidu_ocr_secret_key,
        baidu_ocr_api_base_url,
        youdao_app_key,
        youdao_app_secret,
    ) = {
        let cfg = state
            .config
            .lock()
            .map_err(|e| format!("Config lock error: {}", e))?;
        (
            cfg.translate_provider.clone(),
            cfg.google.api_key.clone(),
            cfg.google.vision_api_url.clone(),
            cfg.baidu.ocr_api_key.clone(),
            cfg.baidu.ocr_secret_key.clone(),
            cfg.baidu.ocr_aip_base_url.clone(),
            cfg.youdao.app_key.clone(),
            cfg.youdao.app_secret.clone(),
        )
    };
    ocr::recognize_text(
        &state.client,
        &image_data,
        &provider,
        &google_cloud_api_key,
        &google_vision_api_url,
        &baidu_ocr_api_key,
        &baidu_ocr_secret_key,
        &baidu_ocr_api_base_url,
        &youdao_app_key,
        &youdao_app_secret,
    )
    .await
}

#[tauri::command]
fn hide_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("translate-floating") {
        window
            .hide()
            .map_err(|e| format!("Hide window error: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn floating_ready(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    let pending = state.pending_translation.clone();
    let current = {
        let p = pending.lock().unwrap();
        p.clone()
    };

    if let Some(translation) = current {
        if translation.loading {
            let _ = app.emit("translate-selection-start", &translation.text);
        } else {
            let _ = app.emit(
                "translate-selection-result",
                serde_json::json!({
                    "text": translation.text,
                    "translated": translation.translated,
                    "error": translation.error,
                    "sourceLang": translation.detected_source_lang,
                }),
            );
        }
    }

    Ok(())
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(main_win) = app.get_webview_window("main") {
        let main_clone = main_win.clone();
        main_win.on_window_event(move |event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = main_clone.hide();
            }
        });
    }

    if let Err(e) = get_or_create_region_select_window(app) {
        eprintln!("Preload region overlay window failed: {}", e);
    }
    if let Err(e) = get_or_create_floating_window(app) {
        eprintln!("Preload floating window failed: {}", e);
    }

    let cfg = {
        let state = app.state::<AppState>();
        let locked = state.config.lock().map_err(|e| e.to_string())?;
        locked.clone()
    };

    if let Err(e) = sync_global_hotkeys(app, &cfg) {
        eprintln!("Register translate hotkeys failed: {}", e);
    }

    sync_launch_on_startup(app, cfg.launch_on_startup);
    Ok(())
}

pub fn build_state() -> AppState {
    AppState {
        client: Client::new(),
        config: std::sync::Mutex::new(load_config()),
        tray_click_generation: Arc::new(AtomicU64::new(0)),
        suppress_next_floating_blur_hide: AtomicBool::new(false),
        pending_translation: Arc::new(Mutex::new(None)),
        region_pending: Mutex::new(None),
        region_capture: Mutex::new(None),
    }
}

pub fn trigger_selection_translate(app: &tauri::AppHandle) -> Result<(), String> {
    do_translate_selection(app)
}

pub fn trigger_screenshot_translate(app: &tauri::AppHandle) -> Result<(), String> {
    do_screenshot_translate(app)
}

pub fn maybe_handle_global_shortcut(
    app: &tauri::AppHandle,
    shortcut: &Shortcut,
    state: ShortcutState,
) {
    if state != ShortcutState::Pressed {
        return;
    }

    let config = match app.state::<AppState>().config.lock() {
        Ok(config) => config.clone(),
        Err(_) => return,
    };

    let selection_shortcut = match Shortcut::from_str(config.hotkey_selection.trim()) {
        Ok(shortcut) => shortcut,
        Err(_) => return,
    };
    let screenshot_shortcut = match Shortcut::from_str(config.hotkey_screenshot.trim()) {
        Ok(shortcut) => shortcut,
        Err(_) => return,
    };

    if shortcut == &selection_shortcut {
        if let Err(error) = trigger_selection_translate(app) {
            eprintln!("[kitty-tools] selection translate failed: {}", error);
        }
    } else if shortcut == &screenshot_shortcut {
        if let Err(error) = trigger_screenshot_translate(app) {
            eprintln!("[kitty-tools] screenshot translate failed: {}", error);
            notify_screenshot_translate_ui(
                app,
                serde_json::json!({
                    "sourceText": "",
                    "translatedText": "",
                    "error": error,
                }),
            );
        }
    }
}

pub fn is_first_run(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    state
        .config
        .lock()
        .map(|config| config.first_run)
        .unwrap_or(false)
}

pub fn current_translate_shortcuts<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<(String, String)> {
    app.state::<AppState>()
        .config
        .lock()
        .ok()
        .map(|config| {
            (
                config.hotkey_selection.trim().to_string(),
                config.hotkey_screenshot.trim().to_string(),
            )
        })
}

#[tauri::command]
pub async fn translate_test_connection(
    state: tauri::State<'_, AppState>,
    snapshot: AppConfig,
) -> Result<TranslateResult, String> {
    test_translate_connection(state, snapshot).await
}

#[tauri::command]
pub async fn translate_start_screenshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source_lang: String,
    target_lang: String,
) -> Result<(), String> {
    start_screenshot_translate(app, state, source_lang, target_lang).await
}

#[tauri::command]
pub fn translate_region_overlay_cancel(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    region_overlay_cancel(app, state)
}

#[tauri::command]
pub fn translate_region_overlay_complete(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<(), String> {
    region_overlay_complete(
        app,
        state,
        x,
        y,
        width,
        height,
        viewport_width,
        viewport_height,
    )
}

#[tauri::command]
pub fn translate_get_settings(state: tauri::State<'_, AppState>) -> Result<AppConfig, String> {
    get_config(state)
}

#[tauri::command]
pub fn translate_save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    config: AppConfig,
) -> Result<(), String> {
    save_config_cmd(app, state, config)
}

#[tauri::command]
pub async fn translate_ocr_image(
    state: tauri::State<'_, AppState>,
    image_data: Vec<u8>,
) -> Result<OcrResult, String> {
    ocr_image(state, image_data).await
}

#[tauri::command]
pub fn translate_hide_floating_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_floating_window(app)
}

#[tauri::command]
pub fn translate_prepare_floating_drag(state: tauri::State<'_, AppState>) {
    state
        .suppress_next_floating_blur_hide
        .store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn window_show_translate_floating(app: tauri::AppHandle) -> Result<(), String> {
    show_floating_window(&app)
}

#[tauri::command]
pub fn translate_floating_ready(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    floating_ready(state, app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = load_config();
    let client = Client::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let state = app.state::<AppState>();
                    let (sel_s, cap_s) = match state.config.lock() {
                        Ok(c) => (
                            c.hotkey_selection.clone(),
                            c.hotkey_screenshot.clone(),
                        ),
                        Err(_) => return,
                    };

                    let sel = match Shortcut::from_str(sel_s.trim()) {
                        Ok(s) => s,
                        Err(_) => return,
                    };
                    let cap = match Shortcut::from_str(cap_s.trim()) {
                        Ok(s) => s,
                        Err(_) => return,
                    };

                    if shortcut == &sel {
                        if let Err(e) = do_translate_selection(app) {
                            eprintln!("Selection translate error: {}", e);
                        }
                    } else if shortcut == &cap {
                        if let Err(e) = do_screenshot_translate(app) {
                            eprintln!("Screenshot translate error: {}", e);
                            notify_screenshot_translate_ui(
                                app,
                                serde_json::json!({
                                    "sourceText": "",
                                    "translatedText": "",
                                    "error": e,
                                }),
                            );
                        }
                    }
                })
                .build(),
        )
        .manage(AppState {
            client,
            config: std::sync::Mutex::new(config),
            tray_click_generation: Arc::new(AtomicU64::new(0)),
            suppress_next_floating_blur_hide: AtomicBool::new(false),
            pending_translation: Arc::new(Mutex::new(None)),
            region_pending: Mutex::new(None),
            region_capture: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            translate_text,
            test_translate_connection,
            start_screenshot_translate,
            region_overlay_cancel,
            region_overlay_complete,
            translate_selection,
            get_config,
            save_config_cmd,
            ocr_image,
            hide_floating_window,
            floating_ready,
            show_settings_window,
            show_translate_workspace_window,
        ])
        .setup(move |app| {
            if let Some(main_win) = app.get_webview_window("main") {
                let main_clone = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = main_clone.hide();
                    }
                });
            }

            if let Err(e) = get_or_create_region_select_window(&app.handle()) {
                eprintln!("预加载选区窗口失败（首次截图时将重试）: {}", e);
            }
            if let Err(e) = get_or_create_floating_window(&app.handle()) {
                eprintln!("预加载浮动翻译窗口失败（首次打开时将重试）: {}", e);
            }

            let cfg = {
                let st = app.state::<AppState>();
                let locked = st.config.lock().expect("config lock");
                locked.clone()
            };
            if let Err(e) = sync_global_hotkeys(&app.handle(), &cfg) {
                eprintln!("注册全局快捷键失败：{}", e);
            }

            sync_launch_on_startup(&app.handle(), cfg.launch_on_startup);

            let tray_menu = build_tray_menu(app.handle(), &cfg)?;

            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("无法加载应用图标，请检查 tauri.conf bundle.icon")?;

            let _tray = TrayIconBuilder::with_id(TRAY_ICON_INSTANCE_ID)
                .tooltip("Kitty 翻译：左键 翻译工作台 · 右键 菜单 · 左键双击 设置（Windows）")
                .icon(icon)
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "tray_settings" => show_main_settings(app),
                        "tray_workspace" => {
                            if let Err(e) = show_translate_workspace(app) {
                                eprintln!("翻译工作台（托盘菜单）: {}", e);
                            }
                        }
                        "tray_selection" => {
                            if let Err(e) = do_translate_selection(app) {
                                eprintln!("划词翻译（托盘菜单）: {}", e);
                            }
                        }
                        "tray_screenshot" => {
                            if let Err(e) = do_screenshot_translate(app) {
                                eprintln!("截图翻译（托盘菜单）: {}", e);
                                notify_screenshot_translate_ui(
                                    app,
                                    serde_json::json!({
                                        "sourceText": "",
                                        "translatedText": "",
                                        "error": e,
                                    }),
                                );
                            }
                        }
                        "tray_quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    let gen = {
                        let st = app.state::<AppState>();
                        Arc::clone(&st.tray_click_generation)
                    };
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            let n = gen.fetch_add(1, Ordering::SeqCst) + 1;
                            let app = app.clone();
                            let gen = Arc::clone(&gen);
                            std::thread::spawn(move || {
                                std::thread::sleep(Duration::from_millis(320));
                                if gen.load(Ordering::SeqCst) == n {
                                    if let Err(e) = show_translate_workspace(&app) {
                                        eprintln!("翻译工作台（托盘左键）: {}", e);
                                    }
                                }
                            });
                        }
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        } => {
                            gen.fetch_add(1, Ordering::SeqCst);
                            show_main_settings(app);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            if cfg.first_run {
                show_main_settings(&app.handle());
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
