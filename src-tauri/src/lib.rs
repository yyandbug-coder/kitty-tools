mod app_state;
mod baidu_creds;
mod clipboard;
mod config;
mod config_sqlite;
mod hotkeys;
mod lang_detect;
mod ocr;
mod screenshot;
mod selection;
mod translate;
mod tray;
mod window;
mod youdao;

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Listener, Manager, RunEvent, Runtime};
use translate::api::{TranslateCreds, TranslateRequest};

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn show_window(window: tauri::Window) {
    window::show_clipboard_popup(&window.app_handle());
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    window::hide_clipboard_popup(&window.app_handle());
}

#[tauri::command]
fn open_settings_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    // 先隐藏 always-on-top 的浮动窗口和剪贴板面板，避免遮挡设置窗口，
    // 也避免失焦自动隐藏逻辑干扰设置窗口的显示和聚焦
    window::hide_floating_window(&app);
    window::hide_clipboard_popup(&app);
    window::show_settings_window(&app).map_err(|e| e.to_string())
}

/// 前端拖拽前调用：设置交互标记并启动原生拖拽，避免 startDragging 导致的短暂失焦触发自动隐藏。
#[tauri::command]
fn start_floating_drag<R: Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, app_state::AppState>) -> Result<(), String> {
    state.floating_interacting.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(window::WINDOW_FLOATING) {
        w.start_dragging().map_err(|e| format!("start_dragging: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn exit_after_flush<R: Runtime>(app: tauri::AppHandle<R>) {
    tray::mark_exit_flush_ack();
    let _ = app.exit(0);
}

#[tauri::command]
fn update_global_shortcut<R: Runtime>(app: tauri::AppHandle<R>, shortcut: String) -> Result<(), String> {
    hotkeys::register_clipboard_shortcut(&app, shortcut.trim())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> config::AppConfig {
    let cfg = app.state::<Mutex<config::AppConfig>>().lock().unwrap().clone();
    cfg
}

#[tauri::command]
fn save_config_cmd<R: Runtime>(app: tauri::AppHandle<R>, config: config::AppConfig) -> Result<config::AppConfig, String> {
    let saved = config::save_config(&config)?;
    let state = app.state::<Mutex<config::AppConfig>>();
    {
        let mut guard = state.lock().unwrap();
        *guard = saved.clone();
    }
    let launch = saved.launch_on_startup;
    // Sync hotkeys if they changed
    if let Err(e) = hotkeys::sync_all_hotkeys(&app, &saved) {
        eprintln!("[kitty-tools] 快捷键同步失败: {}", e);
    }
    // Sync autostart
    sync_launch_on_startup(&app, launch);
    // Refresh tray menu labels
    if let Err(e) = tray::refresh_tray_menu(&app) {
        eprintln!("[kitty-tools] 托盘菜单刷新失败: {}", e);
    }
    // Notify all windows
    let _ = app.emit("config-updated", &saved);
    Ok(saved)
}

#[tauri::command]
async fn translate_text(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<translate::api::TranslateResult, String> {
    let state = app.state::<Mutex<config::AppConfig>>();
    let cfg = state.lock().unwrap().clone();
    let request = translate::api::resolve_translate_request(
        &TranslateRequest {
            text,
            source_lang,
            target_lang,
        },
        &cfg,
    );
    let creds = TranslateCreds::from_config(&cfg);
    let client = reqwest::Client::new();
    translate::api::translate(&client, &request, &cfg.translate_provider, &creds).await
}

#[tauri::command]
async fn test_translate_connection(
    provider: String,
    config: config::AppConfig,
) -> Result<translate::api::TranslateResult, String> {
    let client = reqwest::Client::new();
    let creds = TranslateCreds::from_config(&config);
    let request = TranslateRequest {
        text: "Hello".to_string(),
        source_lang: "en".to_string(),
        target_lang: "zh-CN".to_string(),
    };
    translate::api::translate(&client, &request, &provider, &creds).await
}

#[tauri::command]
async fn start_screenshot_translate(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<config::AppConfig>>();
    let cfg = state.lock().unwrap().clone();
    let app_state = app.state::<app_state::AppState>();
    {
        let mut rp = app_state.region_pending.lock().unwrap();
        *rp = Some(app_state::RegionPending::Translate {
            source_lang: cfg.source_lang.clone(),
            target_lang: cfg.target_lang.clone(),
        });
    }
    prepare_and_show_region_overlay(app.clone())?;
    Ok(())
}

#[tauri::command]
fn region_overlay_cancel(app: tauri::AppHandle) {
    let app_state = app.state::<app_state::AppState>();
    {
        let mut rp = app_state.region_pending.lock().unwrap();
        *rp = None;
    }
    {
        let mut rc = app_state.region_capture.lock().unwrap();
        *rc = None;
    }
    window::hide_region_overlay(&app);
}

#[tauri::command]
async fn region_overlay_complete(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_w: f64,
    viewport_h: f64,
) -> Result<(), String> {
    let app_state = app.state::<app_state::AppState>();

    let region_pending = app_state.region_pending.lock().unwrap().take();
    let full_capture = app_state.region_capture.lock().unwrap().take();

    let Some(app_state::RegionPending::Translate { source_lang, target_lang }) = region_pending
    else {
        return Err("无待处理的选区任务".to_string());
    };
    let Some(full) = full_capture else {
        return Err("无截屏缓存".to_string());
    };

    let cropped = screenshot::crop_from_viewport_mapping(
        &full, x, y, width, height, viewport_w, viewport_h,
    )?;
    let png_bytes = screenshot::rgba_to_png(&cropped)?;

    window::hide_region_overlay(&app);

    let cfg = app.state::<Mutex<config::AppConfig>>().lock().unwrap().clone();
    spawn_screenshot_translate_pipeline(&app, png_bytes, source_lang, target_lang, &cfg);
    Ok(())
}

#[tauri::command]
async fn translate_selection(app: tauri::AppHandle) -> Result<(), String> {
    let text = selection::get_selected_text()?;
    do_translate_selection(&app, text);
    Ok(())
}

#[tauri::command]
fn hide_floating_window(app: tauri::AppHandle) {
    window::hide_floating_window(&app);
}

#[tauri::command]
fn floating_ready(app: tauri::AppHandle) {
    let app_state = app.state::<app_state::AppState>();
    let pending = app_state.pending_translation.lock().unwrap().take();
    if let Some(pt) = pending {
        let _ = app.emit("translate-selection-start", &pt.source_text);
        match pt.state.as_str() {
            "result" => {
                let _ = app.emit("translate-selection-result", serde_json::json!({
                    "text": pt.source_text,
                    "translated": pt.translated_text.unwrap_or_default(),
                    "sourceLang": pt.source_lang.unwrap_or_default(),
                }));
            }
            "error" => {
                let _ = app.emit("translate-selection-result", serde_json::json!({
                    "text": pt.source_text,
                    "translated": "",
                    "error": pt.error.unwrap_or_default(),
                }));
            }
            _ => {}
        }
    }
}

#[tauri::command]
fn show_settings_window_cmd<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_settings_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_translate_workspace_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_translate_workspace(&app).map_err(|e| e.to_string())
}

// ── Translate pipeline helpers ──────────────────────────────────────────────

fn do_translate_selection<R: Runtime>(app: &tauri::AppHandle<R>, text: String) {
    let cfg = app.state::<Mutex<config::AppConfig>>().lock().unwrap().clone();
    let app_state = app.state::<app_state::AppState>();

    let resolved = translate::api::resolve_translate_request(
        &TranslateRequest {
            text: text.clone(),
            source_lang: cfg.source_lang.clone(),
            target_lang: cfg.target_lang.clone(),
        },
        &cfg,
    );

    {
        let mut pt = app_state.pending_translation.lock().unwrap();
        *pt = Some(app_state::PendingTranslation {
            state: "loading".to_string(),
            source_text: text.clone(),
            translated_text: None,
            source_lang: Some(resolved.source_lang.clone()),
            target_lang: Some(resolved.target_lang.clone()),
            error: None,
        });
    }

    let _ = window::show_floating_window(app);
    let _ = app.emit("translate-selection-start", &text);

    let app_clone = app.clone();
    let text_to_translate = resolved.text.clone();
    let source_lang = resolved.source_lang;
    let target_lang = resolved.target_lang;
    let provider = cfg.translate_provider.clone();
    let creds = TranslateCreds::from_config(&cfg);

    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        let request = TranslateRequest {
            text: text_to_translate,
            source_lang,
            target_lang: target_lang.clone(),
        };
        match translate::api::translate(&client, &request, &provider, &creds).await {
            Ok(result) => {
                let state = app_clone.state::<app_state::AppState>();
                {
                    let mut pt = state.pending_translation.lock().unwrap();
                    *pt = Some(app_state::PendingTranslation {
                        state: "result".to_string(),
                        source_text: result.source_text.clone(),
                        translated_text: Some(result.translated_text.clone()),
                        source_lang: Some(result.source_lang.clone()),
                        target_lang: Some(result.target_lang.clone()),
                        error: None,
                    });
                }
                let _ = app_clone.emit("translate-selection-result", serde_json::json!({
                    "text": result.source_text,
                    "translated": result.translated_text,
                    "sourceLang": result.source_lang,
                }));
            }
            Err(e) => {
                let state = app_clone.state::<app_state::AppState>();
                {
                    let mut pt = state.pending_translation.lock().unwrap();
                    *pt = Some(app_state::PendingTranslation {
                        state: "error".to_string(),
                        source_text: text.clone(),
                        translated_text: None,
                        source_lang: None,
                        target_lang: None,
                        error: Some(e.clone()),
                    });
                }
                let _ = app_clone.emit("translate-selection-result", serde_json::json!({
                    "text": text,
                    "translated": "",
                    "error": e,
                }));
            }
        }
    });
}

fn prepare_and_show_region_overlay<R: Runtime + 'static>(app: tauri::AppHandle<R>) -> Result<(), String> {
    std::thread::spawn(move || {
        let capture = match screenshot::capture_virtual_desktop_rgba() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[kitty-tools] 截屏失败: {}", e);
                return;
            }
        };
        let app_state = app.state::<app_state::AppState>();
        {
            let mut rc = app_state.region_capture.lock().unwrap();
            *rc = Some(capture);
        }
        let _ = window::show_region_overlay(&app);
    });
    Ok(())
}

fn spawn_screenshot_translate_pipeline<R: Runtime>(
    app: &tauri::AppHandle<R>,
    image_data: Vec<u8>,
    source_lang: String,
    target_lang: String,
    cfg: &config::AppConfig,
) {
    let app_state = app.state::<app_state::AppState>();

    {
        let mut pt = app_state.pending_translation.lock().unwrap();
        *pt = Some(app_state::PendingTranslation {
            state: "loading".to_string(),
            source_text: String::new(),
            translated_text: None,
            source_lang: Some(source_lang.clone()),
            target_lang: Some(target_lang.clone()),
            error: None,
        });
    }

    let _ = window::show_floating_window(app);
    let _ = app.emit("translate-selection-start", "");

    let app_clone = app.clone();
    let provider = cfg.translate_provider.clone();
    let creds = TranslateCreds::from_config(cfg);
    let baidu_app_id = cfg.baidu.app_id.clone();
    let baidu_secret = cfg.baidu.secret.clone();

    tauri::async_runtime::spawn(async move {
        if provider == "baidu" {
            match translate::api::baidu_translate_screenshot_image(
                &reqwest::Client::new(),
                &image_data,
                &source_lang,
                &target_lang,
                &baidu_app_id,
                &baidu_secret,
            )
            .await
            {
                Ok(result) => {
                    emit_translate_result(&app_clone, result, "".to_string());
                }
                Err(e) => {
                    emit_translate_error(&app_clone, e);
                }
            }
            return;
        }

        // For other providers: OCR first, then translate
        let ocr_result = ocr::recognize_text(
            &reqwest::Client::new(),
            &image_data,
            &provider,
            &creds.google_cloud_api_key,
            &creds.google_translate_api_url,
            &cfg_from_app(&app_clone).baidu.ocr_api_key,
            &cfg_from_app(&app_clone).baidu.ocr_secret_key,
            &cfg_from_app(&app_clone).baidu.ocr_aip_base_url,
            &creds.youdao_app_key,
            &creds.youdao_app_secret,
        )
        .await;

        match ocr_result {
            Ok(ocr) => {
                if ocr.text.trim().is_empty() {
                    emit_translate_error(&app_clone, "截图中未识别到文字".to_string());
                    return;
                }
                let _ = app_clone.emit("translate-selection-start", &ocr.text);

                let request = TranslateRequest {
                    text: ocr.text,
                    source_lang: source_lang.clone(),
                    target_lang: target_lang.clone(),
                };
                match translate::api::translate(
                    &reqwest::Client::new(),
                    &request,
                    &provider,
                    &creds,
                )
                .await
                {
                    Ok(result) => {
                        emit_translate_result(&app_clone, result, "".to_string());
                    }
                    Err(e) => {
                        emit_translate_error(&app_clone, e);
                    }
                }
            }
            Err(e) => {
                emit_translate_error(&app_clone, e);
            }
        }
    });
}

fn cfg_from_app<R: Runtime>(app: &tauri::AppHandle<R>) -> config::AppConfig {
    app.state::<Mutex<config::AppConfig>>()
        .lock()
        .unwrap()
        .clone()
}

fn emit_translate_result<R: Runtime>(
    app: &tauri::AppHandle<R>,
    result: translate::api::TranslateResult,
    _source_from_ocr: String,
) {
    let state = app.state::<app_state::AppState>();
    {
        let mut pt = state.pending_translation.lock().unwrap();
        *pt = Some(app_state::PendingTranslation {
            state: "result".to_string(),
            source_text: result.source_text.clone(),
            translated_text: Some(result.translated_text.clone()),
            source_lang: Some(result.source_lang.clone()),
            target_lang: Some(result.target_lang.clone()),
            error: None,
        });
    }
    let _ = app.emit("translate-selection-result", serde_json::json!({
        "text": result.source_text,
        "translated": result.translated_text,
        "sourceLang": result.source_lang,
    }));
}

fn emit_translate_error<R: Runtime>(app: &tauri::AppHandle<R>, error: String) {
    let state = app.state::<app_state::AppState>();
    let source_text;
    {
        let mut pt = state.pending_translation.lock().unwrap();
        source_text = pt.as_ref().map(|p| p.source_text.clone()).unwrap_or_default();
        if let Some(ref mut p) = *pt {
            p.state = "error".to_string();
            p.error = Some(error.clone());
        }
    }
    let _ = app.emit("translate-selection-result", serde_json::json!({
        "text": source_text,
        "translated": "",
        "error": error,
    }));
}

fn sync_launch_on_startup<R: Runtime>(app: &tauri::AppHandle<R>, enable: bool) {
    use tauri_plugin_autostart::ManagerExt;
    if enable {
        let _ = app.autolaunch().enable();
    } else {
        let _ = app.autolaunch().disable();
    }
}

// ── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show_clipboard_popup(&app);
        }));
    }

    let config = config::load_config();
    let first_run = config.first_run;
    let launch_on_startup = config.launch_on_startup;

    builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(config))
        .manage(app_state::AppState {
            client: reqwest::Client::new(),
            config: Mutex::new(config::AppConfig::default()),
            pending_translation: Arc::new(Mutex::new(None)),
            region_pending: Mutex::new(None),
            region_capture: Mutex::new(None),
            tray_click_generation: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            floating_interacting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            // Clipboard commands
            clipboard::watcher::start_clipboard_watcher,
            show_window,
            hide_window,
            open_settings_window,
            exit_after_flush,
            clipboard::paste::paste_item,
            update_global_shortcut,
            clipboard::image_cache::get_image_preview_asset_path,
            clipboard::image_cache::prune_clipboard_image_store,
            clipboard::app_icon::get_app_icon_data_url,
            // Translate commands
            get_config,
            save_config_cmd,
            translate_text,
            test_translate_connection,
            start_screenshot_translate,
            region_overlay_cancel,
            region_overlay_complete,
            translate_selection,
            hide_floating_window,
            floating_ready,
            show_settings_window_cmd,
            show_translate_workspace_window,
            start_floating_drag,
        ])
        .setup(move |app| {
            // Build tray
            if let Err(e) = tray::build_tray(&app.handle()) {
                eprintln!("[kitty-tools] 托盘初始化失败: {}", e);
            }

            // Ensure tray-only app (no dock/taskbar icon)
            if let Err(e) = window::ensure_tray_only_app(&app.handle()) {
                eprintln!("[kitty-tools] 设置托盘模式失败: {}", e);
            }

            // Register global shortcuts
            let cfg = app.state::<Mutex<config::AppConfig>>().lock().unwrap().clone();
            if let Err(e) = hotkeys::sync_all_hotkeys(&app.handle(), &cfg) {
                eprintln!("[kitty-tools] 快捷键注册失败: {}", e);
                let _ = app.handle().emit("global-shortcut-register-failed", e);
            }

            // Sync autostart
            sync_launch_on_startup(&app.handle(), launch_on_startup);

            // Pre-create clipboard, floating, region-select and settings windows
            let _ = window::get_or_create_clipboard_popup_window(&app.handle());
            let _ = window::get_or_create_floating_window(&app.handle());
            let _ = window::get_or_create_region_select_window(&app.handle());
            let _ = window::get_or_create_settings_window(&app.handle());

            // Handle hotkey events for translate pipelines
            let app_handle = app.handle().clone();
            app.listen("hotkey-selection-translate", move |_| {
                match selection::get_selected_text() {
                    Ok(text) => do_translate_selection(&app_handle, text),
                    Err(e) => eprintln!("[kitty-tools] 划词翻译获取选中文本失败: {}", e),
                }
            });

            let app_handle = app.handle().clone();
            app.listen("hotkey-screenshot-translate", move |_| {
                let app_clone = app_handle.clone();
                let state = app_clone.state::<Mutex<config::AppConfig>>();
                let cfg = state.lock().unwrap().clone();
                let app_state = app_clone.state::<app_state::AppState>();
                {
                    let mut rp = app_state.region_pending.lock().unwrap();
                    *rp = Some(app_state::RegionPending::Translate {
                        source_lang: cfg.source_lang.clone(),
                        target_lang: cfg.target_lang.clone(),
                    });
                }
                if let Err(e) = prepare_and_show_region_overlay(app_clone.clone()) {
                    eprintln!("[kitty-tools] 截图翻译失败: {}", e);
                }
            });

            // Show onboarding on first run
            if first_run {
                let _ = window::show_onboarding_window(&app.handle());
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if !tray::ALLOW_APP_EXIT.swap(false, Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
        });
}
