mod app_state;
mod baidu_creds;
mod clipboard;
mod config;
mod config_sqlite;
mod hotkeys;
mod lang_detect;
mod launcher;
mod ocr;
mod screenshot;
#[cfg(target_os = "macos")]
mod screenshot_macos_sck;
mod selection;
mod translate;
mod tray;
mod window;
#[cfg(target_os = "windows")]
mod win32_sysmenu;
mod youdao;

#[cfg(not(target_os = "macos"))]
use std::sync::atomic::AtomicU64;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use std::time::Duration;

use tauri::{Emitter, Listener, Manager, RunEvent, Runtime};
use translate::api::{TranslateCreds, TranslateRequest};

/// `save_config_cmd` 返回值：配置已写入磁盘且内存已更新；`sync_warnings` 为快捷键/自启/托盘等非致命同步失败说明。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConfigCmdResult {
    pub config: config::AppConfig,
    pub sync_warnings: Vec<String>,
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn show_window(window: tauri::Window) {
    window::show_clipboard_popup(window.app_handle());
}

#[tauri::command]
fn hide_window(window: tauri::Window) {
    window::hide_clipboard_popup(window.app_handle());
}

#[tauri::command]
fn open_settings_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::present_settings_window(&app).map_err(|e| e.to_string())
}

/// 开发调试用：打开首次运行引导窗口（生产包无入口，由前端仅在 dev 调用）。
#[tauri::command]
fn show_onboarding_window_cmd<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_onboarding_window(&app).map_err(|e| e.to_string())
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

/// 剪贴板弹窗拖拽：设置交互标记并启动原生拖拽，避免失焦自动隐藏。
#[tauri::command]
fn start_clipboard_drag<R: Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, app_state::AppState>) -> Result<(), String> {
    state.clipboard_interacting.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(window::WINDOW_CLIPBOARD_POPUP) {
        w.start_dragging().map_err(|e| format!("start_dragging: {}", e))?;
    }
    Ok(())
}

/// 启动器窗口拖拽：设置交互标记并启动原生拖拽，避免失焦按配置误隐藏。
#[tauri::command]
fn start_launcher_drag<R: Runtime>(app: tauri::AppHandle<R>, state: tauri::State<'_, app_state::AppState>) -> Result<(), String> {
    state.launcher_interacting.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window(window::WINDOW_LAUNCHER) {
        w.start_dragging().map_err(|e| format!("start_dragging: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn exit_after_flush<R: Runtime>(app: tauri::AppHandle<R>) {
    tray::mark_exit_flush_ack();
    app.exit(0);
}

#[tauri::command]
fn update_global_shortcut<R: Runtime>(app: tauri::AppHandle<R>, shortcut: String) -> Result<(), String> {
    hotkeys::register_clipboard_shortcut(&app, shortcut.trim())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> config::AppConfig {
    app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone()
}

#[tauri::command]
fn save_config_cmd<R: Runtime>(
    app: tauri::AppHandle<R>,
    config: config::AppConfig,
) -> Result<SaveConfigCmdResult, String> {
    hotkeys::validate_hotkey_config(&config)?;
    let saved = config::save_config(&config)?;
    {
        let cfg_mutex = app.state::<Mutex<config::AppConfig>>();
        let mut guard = app_state::lock_poisoned(&*cfg_mutex);
        *guard = saved.clone();
    }
    let launch = saved.launch_on_startup;
    let mut sync_warnings = Vec::new();

    if let Err(e) = hotkeys::sync_all_hotkeys(&app, &saved) {
        let msg = format!("快捷键同步失败: {}", e);
        eprintln!("[kitty-tools] {}", msg);
        sync_warnings.push(msg);
    }
    if let Err(e) = sync_launch_on_startup(&app, launch) {
        let msg = format!("开机自启设置未生效: {}", e);
        eprintln!("[kitty-tools] {}", msg);
        sync_warnings.push(msg);
    }
    if let Err(e) = tray::refresh_tray_menu(&app, &saved) {
        let msg = format!("托盘菜单刷新失败: {}", e);
        eprintln!("[kitty-tools] {}", msg);
        sync_warnings.push(msg);
    }

    let _ = app.emit("config-updated", &saved);
    Ok(SaveConfigCmdResult {
        config: saved,
        sync_warnings,
    })
}

#[tauri::command]
async fn translate_text(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<translate::api::TranslateResult, String> {
    let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
    let request = translate::api::resolve_translate_request(
        &TranslateRequest {
            text,
            source_lang,
            target_lang,
        },
        &cfg,
    );
    let creds = TranslateCreds::from_config(&cfg);
    let client = app.state::<app_state::AppState>().client.clone();
    translate::api::translate(&client, &request, &cfg.translate_provider, &creds).await
}

#[tauri::command]
async fn test_translate_connection(
    app: tauri::AppHandle,
    provider: String,
    config: config::AppConfig,
) -> Result<translate::api::TranslateResult, String> {
    let client = app.state::<app_state::AppState>().client.clone();
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
    let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
    let app_state = app.state::<app_state::AppState>();
    {
        let mut rp = app_state::lock_poisoned(&app_state.region_pending);
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
        let mut rp = app_state::lock_poisoned(&app_state.region_pending);
        *rp = None;
    }
    {
        let mut rc = app_state::lock_poisoned(&app_state.region_capture);
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

    let region_pending = app_state::lock_poisoned(&app_state.region_pending).take();
    let full_capture = app_state::lock_poisoned(&app_state.region_capture).take();

    let Some(app_state::RegionPending::Translate { source_lang, target_lang }) = region_pending
    else {
        return Err("无待处理的选区任务".to_string());
    };

    #[cfg(target_os = "macos")]
    {
        let _ = full_capture;
        // 先隐藏选区，再短延迟一帧，避免 SCK 采到压暗/选框；然后只截选区，不再事先全屏抓图
        window::hide_region_overlay(&app);
        tokio::time::sleep(Duration::from_millis(40)).await;
        let (vx, vy, vw, vh) = screenshot::virtual_screen_bounds().map_err(|e| e.to_string())?;
        let image = tauri::async_runtime::spawn_blocking({
            let params = (vx, vy, vw, vh, x, y, width, height, viewport_w, viewport_h);
            move || {
                let (vx, vy, vw, vh, x, y, w, h, vvw, vvh) = params;
                crate::screenshot_macos_sck::capture_overlay_selection_sck(
                    vx, vy, vw, vh, x, y, w, h, vvw, vvh,
                )
            }
        })
        .await
        .map_err(|e| e.to_string())??;
        let png_bytes = screenshot::rgba_to_png(&image)?;
        let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
        spawn_screenshot_translate_pipeline(&app, png_bytes, source_lang, target_lang, &cfg);
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let Some(full) = full_capture else {
            return Err("无截屏缓存".to_string());
        };

        let cropped = screenshot::crop_from_viewport_mapping(
            &full, x, y, width, height, viewport_w, viewport_h,
        )?;
        let png_bytes = screenshot::rgba_to_png(&cropped)?;

        window::hide_region_overlay(&app);

        let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
        spawn_screenshot_translate_pipeline(&app, png_bytes, source_lang, target_lang, &cfg);
        Ok(())
    }
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
    let pending = app_state::lock_poisoned_arc(&app_state.pending_translation).take();
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
    window::present_settings_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_translate_workspace_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_translate_workspace(&app).map_err(|e| e.to_string())
}

// ── Translate pipeline helpers ──────────────────────────────────────────────

fn do_translate_selection<R: Runtime>(app: &tauri::AppHandle<R>, text: String) {
    let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
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
        let mut pt = app_state::lock_poisoned_arc(&app_state.pending_translation);
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
    let client = app.state::<app_state::AppState>().client.clone();

    tauri::async_runtime::spawn(async move {
        let request = TranslateRequest {
            text: text_to_translate,
            source_lang,
            target_lang: target_lang.clone(),
        };
        match translate::api::translate(&client, &request, &provider, &creds).await {
            Ok(result) => {
                let state = app_clone.state::<app_state::AppState>();
                {
                    let mut pt = app_state::lock_poisoned_arc(&state.pending_translation);
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
                    let mut pt = app_state::lock_poisoned_arc(&state.pending_translation);
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
    #[cfg(target_os = "macos")]
    {
        // 遮罩透明，无需先全屏截屏；选区在确认后单独 SCK
        return window::show_region_overlay(&app).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let app_state = app.state::<app_state::AppState>();
        let my_seq = app_state.region_capture_seq.fetch_add(1, Ordering::SeqCst) + 1;
        let app_handle = app.clone();
        std::thread::spawn(move || {
            let capture = match screenshot::capture_virtual_desktop_rgba() {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[kitty-tools] 截屏失败: {}", e);
                    let app_state = app_handle.state::<app_state::AppState>();
                    let latest = app_state.region_capture_seq.load(Ordering::SeqCst);
                    if my_seq != latest {
                        return;
                    }
                    {
                        let mut rp = app_state::lock_poisoned(&app_state.region_pending);
                        *rp = None;
                    }
                    let _ = app_handle.emit("region-capture-failed", serde_json::json!({
                        "error": format!("截屏失败: {}", e),
                    }));
                    return;
                }
            };
            let app_state = app_handle.state::<app_state::AppState>();
            let latest = app_state.region_capture_seq.load(Ordering::SeqCst);
            if my_seq != latest {
                return;
            }
            {
                let mut rc = app_state::lock_poisoned(&app_state.region_capture);
                *rc = Some(capture);
            }
            let latest2 = app_state.region_capture_seq.load(Ordering::SeqCst);
            if my_seq != latest2 {
                return;
            }
            let _ = window::show_region_overlay(&app_handle);
        });
        Ok(())
    }
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
        let mut pt = app_state::lock_poisoned_arc(&app_state.pending_translation);
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
    let baidu_ocr_api_key = cfg.baidu.ocr_api_key.clone();
    let baidu_ocr_secret_key = cfg.baidu.ocr_secret_key.clone();
    let baidu_ocr_aip_base_url = cfg.baidu.ocr_aip_base_url.clone();
    let client = app.state::<app_state::AppState>().client.clone();

    tauri::async_runtime::spawn(async move {
        if provider == "baidu" {
            match translate::api::baidu_translate_screenshot_image(
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
            &client,
            &image_data,
            &provider,
            &creds.google_cloud_api_key,
            &creds.google_translate_api_url,
            &baidu_ocr_api_key,
            &baidu_ocr_secret_key,
            &baidu_ocr_aip_base_url,
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
                    &client,
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

fn emit_translate_result<R: Runtime>(
    app: &tauri::AppHandle<R>,
    result: translate::api::TranslateResult,
    _source_from_ocr: String,
) {
    let state = app.state::<app_state::AppState>();
    {
        let mut pt = app_state::lock_poisoned_arc(&state.pending_translation);
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
        let mut pt = app_state::lock_poisoned_arc(&state.pending_translation);
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

fn sync_launch_on_startup<R: Runtime>(app: &tauri::AppHandle<R>, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if enable {
        app.autolaunch().enable().map_err(|e| e.to_string())
    } else {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }
}

// ── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show_clipboard_popup(app);
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
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|e| {
                    eprintln!("[kitty-tools] 构建 HTTP 客户端失败，使用无超时回退: {}", e);
                    reqwest::Client::new()
                }),
            pending_translation: Arc::new(Mutex::new(None)),
            region_pending: Mutex::new(None),
            region_capture: Mutex::new(None),
            #[cfg(not(target_os = "macos"))]
            region_capture_seq: AtomicU64::new(0),
            floating_interacting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            clipboard_interacting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            launcher_interacting: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            // Clipboard commands
            clipboard::watcher::start_clipboard_watcher,
            show_window,
            hide_window,
            open_settings_window,
            show_onboarding_window_cmd,
            exit_after_flush,
            clipboard::paste::paste_item,
            update_global_shortcut,
            clipboard::image_cache::get_image_preview_asset_path,
            clipboard::image_cache::prune_clipboard_image_store,
            clipboard::app_icon::get_app_icon_data_url,
            clipboard::history_db::replace_clipboard_history_items,
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
            start_clipboard_drag,
            start_launcher_drag,
            launcher::launcher_query,
            launcher::launcher_execute,
        ])
        .setup(move |app| {
            let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();

            // Build tray（复用已加载配置，避免再次读 SQLite）
            if let Err(e) = tray::build_tray(app.handle(), &cfg) {
                eprintln!("[kitty-tools] 托盘初始化失败: {}", e);
            }

            // Ensure tray-only app (no dock/taskbar icon)
            if let Err(e) = window::ensure_tray_only_app(app.handle()) {
                eprintln!("[kitty-tools] 设置托盘模式失败: {}", e);
            }

            // Register global shortcuts
            if let Err(e) = hotkeys::sync_all_hotkeys(app.handle(), &cfg) {
                eprintln!("[kitty-tools] 快捷键注册失败: {}", e);
                let _ = app.handle().emit("global-shortcut-register-failed", e);
            }

            // Sync autostart
            if let Err(e) = sync_launch_on_startup(app.handle(), launch_on_startup) {
                eprintln!("[kitty-tools] 开机自启同步失败: {}", e);
                let _ = app.handle().emit("autostart-sync-failed", e);
            }

            // Pre-create clipboard, floating, region-select, launcher, settings and onboarding windows
            let _ = window::get_or_create_clipboard_popup_window(app.handle());
            let _ = window::get_or_create_floating_window(app.handle());
            let _ = window::get_or_create_region_select_window(app.handle());
            let _ = window::get_or_create_launcher_window(app.handle());
            let _ = window::get_or_create_settings_window(app.handle());
            let _ = window::get_or_create_onboarding_window(app.handle());

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
                let cfg = app_state::lock_poisoned(&*app_clone.state::<Mutex<config::AppConfig>>()).clone();
                let app_state = app_clone.state::<app_state::AppState>();
                {
                    let mut rp = app_state::lock_poisoned(&app_state.region_pending);
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
                let _ = window::show_onboarding_window(app.handle());
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
