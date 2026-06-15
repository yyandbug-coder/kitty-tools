mod app_state;
mod app_updater;
mod baidu_creds;
mod clipboard;
mod config;
mod config_sqlite;
mod hotkeys;
mod lang_detect;
mod launcher;
#[cfg(target_os = "macos")]
mod mac_input;
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
#[cfg(target_os = "windows")]
mod win_input;
mod youdao;

#[cfg(not(target_os = "macos"))]
use std::sync::atomic::AtomicU64;
use std::sync::atomic::{AtomicBool, Ordering};
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
fn show_launcher_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_launcher(&app);
    Ok(())
}

#[tauri::command]
fn show_json_editor_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::show_json_editor(&app);
    Ok(())
}

/// 从功能主页打开独立浮层/工作台：先隐藏主窗口再展示目标，并抑制失焦自动隐藏，避免浮层一闪即关。
#[tauri::command]
async fn open_hub_feature(app: tauri::AppHandle, command: String) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    use std::time::Duration;

    let suppress = app
        .state::<app_state::AppState>()
        .suppress_overlay_autohide
        .clone();
    suppress.store(true, Ordering::Release);

    let clear_suppress = || {
        let s = suppress.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            s.store(false, Ordering::Release);
        });
    };

    if let Err(e) = window::hide_settings_window(&app) {
        clear_suppress();
        return Err(e.to_string());
    }

    let result: Result<(), String> = match command.as_str() {
        "show_window" => {
            window::show_clipboard_popup(&app);
            Ok(())
        }
        "show_launcher_window" => {
            window::show_launcher(&app);
            Ok(())
        }
        "show_json_editor_window" => {
            window::show_json_editor(&app);
            Ok(())
        }
        "translate_selection" => {
            handle_selection_translate_hotkey(&app);
            Ok(())
        }
        "start_screenshot_translate" => {
            let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
            let app_state = app.state::<app_state::AppState>();
            {
                let mut rp = app_state::lock_poisoned(&app_state.region_pending);
                *rp = Some(app_state::RegionPending::Translate {
                    source_lang: cfg.source_lang.clone(),
                    target_lang: cfg.target_lang.clone(),
                });
            }
            prepare_and_show_region_overlay(app.clone())
        }
        other => Err(format!("未知功能: {other}")),
    };

    if result.is_err() {
        suppress.store(false, Ordering::Release);
    } else {
        clear_suppress();
    }
    result
}

#[tauri::command]
fn open_settings_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::present_settings_page_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_settings_window<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::hide_settings_window(&app).map_err(|e| e.to_string())
}

/// 开发调试用：打开主窗口并展示欢迎引导。
#[tauri::command]
fn show_welcome_onboarding_cmd<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::present_settings_window(&app).map_err(|e| e.to_string())?;
    let _ = app.emit("show-welcome-onboarding", ());
    Ok(())
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
        let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
        // 不同 OCR 服务对图片大小容忍度不同：百度走 2560 长边压缩；Google/OpenAI 等放宽到 4096，保留小字细节。
        let max_long_edge =
            crate::screenshot_macos_sck::max_long_edge_for_provider(&cfg.translate_provider);
        // 把 capture + PNG 编码放在同一个 spawn_blocking 闭包里，避免 PNG 编码 (~50-150ms) 跑在 tokio worker 上。
        let png_bytes = tauri::async_runtime::spawn_blocking({
            let params = (vx, vy, vw, vh, x, y, width, height, viewport_w, viewport_h);
            move || -> Result<Vec<u8>, String> {
                let (vx, vy, vw, vh, x, y, w, h, vvw, vvh) = params;
                let image = crate::screenshot_macos_sck::capture_overlay_selection_sck(
                    vx, vy, vw, vh, x, y, w, h, vvw, vvh, max_long_edge,
                )?;
                screenshot::rgba_to_png(&image)
            }
        })
        .await
        .map_err(|e| e.to_string())??;
        spawn_screenshot_translate_pipeline(&app, png_bytes, source_lang, target_lang, &cfg);
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let Some(full) = full_capture else {
            return Err("无截屏缓存".to_string());
        };

        // crop + PNG 编码均为 CPU 密集（4K 全屏 PNG 编码可达 100-200ms），
        // 不能直接跑在 #[tauri::command] async 的 tokio worker 上，否则会阻塞其他 HTTP/翻译任务。
        let png_bytes = tauri::async_runtime::spawn_blocking(move || {
            let cropped = screenshot::crop_from_viewport_mapping(
                &full, x, y, width, height, viewport_w, viewport_h,
            )?;
            screenshot::rgba_to_png(&cropped)
        })
        .await
        .map_err(|e| e.to_string())??;

        window::hide_region_overlay(&app);

        let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();
        spawn_screenshot_translate_pipeline(&app, png_bytes, source_lang, target_lang, &cfg);
        Ok(())
    }
}

#[tauri::command]
async fn translate_selection(app: tauri::AppHandle) -> Result<(), String> {
    handle_selection_translate_hotkey(&app);
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
        match pt.state.as_str() {
            "idle" => {
                let _ = app.emit("translate-panel-idle", ());
            }
            "result" => {
                let _ = app.emit("translate-selection-start", &pt.source_text);
                let _ = app.emit("translate-selection-result", serde_json::json!({
                    "text": pt.source_text,
                    "translated": pt.translated_text.unwrap_or_default(),
                    "sourceLang": pt.source_lang.unwrap_or_default(),
                }));
            }
            "error" => {
                let _ = app.emit("translate-selection-start", &pt.source_text);
                let _ = app.emit("translate-selection-result", serde_json::json!({
                    "text": pt.source_text,
                    "translated": "",
                    "error": pt.error.unwrap_or_default(),
                }));
            }
            _ => {
                let _ = app.emit("translate-selection-start", &pt.source_text);
            }
        }
    }
}

#[tauri::command]
fn show_settings_window_cmd<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    window::present_settings_page_window(&app).map_err(|e| e.to_string())
}

// ── Translate pipeline helpers ──────────────────────────────────────────────

/// 防止用户连按划词快捷键导致多个线程同时读写剪贴板（可能触发 Win32 异常或 UI 卡死）。
static SELECTION_HOTKEY_BUSY: AtomicBool = AtomicBool::new(false);

/// 窗口 / WebView 操作必须在主线程执行；失败时打日志，避免静默闪退。
fn dispatch_to_main<R: Runtime, F: FnOnce() + Send + 'static>(
    app: tauri::AppHandle<R>,
    f: F,
) {
    if let Err(e) = app.run_on_main_thread(f) {
        eprintln!("[kitty-tools] run_on_main_thread 失败: {}", e);
    }
}

/// 划词翻译快捷键：须先同步获取选区再弹窗（浮窗 `set_focus` 会取消原应用选区）。
/// 剪贴板模拟复制会阻塞数百毫秒，必须在后台线程执行；窗口操作再切回主线程。
fn handle_selection_translate_hotkey<R: Runtime + 'static>(app: &tauri::AppHandle<R>) {
    if SELECTION_HOTKEY_BUSY.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        struct BusyGuard;
        impl Drop for BusyGuard {
            fn drop(&mut self) {
                SELECTION_HOTKEY_BUSY.store(false, Ordering::SeqCst);
            }
        }
        let _busy = BusyGuard;

        match selection::get_selected_text_for_hotkey() {
            Ok(text) if !text.trim().is_empty() => {
                let app_main = app.clone();
                dispatch_to_main(app, move || {
                    do_translate_selection(&app_main, text);
                });
            }
            _ => {
                let app_main = app.clone();
                dispatch_to_main(app, move || {
                    show_floating_input_panel(&app_main);
                });
            }
        }
    });
}

/// 无选中文本时打开浮窗，供用户手动输入（类似 Bob / Pot 的「输入翻译」）。
fn show_floating_input_panel<R: Runtime>(app: &tauri::AppHandle<R>) {
    let app_state = app.state::<app_state::AppState>();
    {
        let mut pt = app_state::lock_poisoned_arc(&app_state.pending_translation);
        *pt = Some(app_state::PendingTranslation {
            state: "idle".to_string(),
            source_text: String::new(),
            translated_text: None,
            source_lang: None,
            target_lang: None,
            error: None,
        });
    }
    let _ = window::show_floating_window(app);
    let _ = app.emit("translate-panel-idle", ());
    let _ = app.emit("focus-floating-panel", ());
}

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
    // 顺序敏感：先 from_config(&cfg) 借出读引用，借用结束后再把 cfg 字段 move 出来；
    // 这样 provider / 后续 spawn 内部 String 字段都无需 clone。
    // Arc 共享凭证：spawn 的 future 只需 Arc::clone 而不必 deep-clone 10+ 字符串。
    let creds = Arc::new(TranslateCreds::from_config(&cfg));
    let provider = cfg.translate_provider; // move
    let text_to_translate = resolved.text; // move（只在 spawn 内部消费一次）
    let source_lang = resolved.source_lang;
    let target_lang = resolved.target_lang;
    let client = app.state::<app_state::AppState>().client.clone();

    tauri::async_runtime::spawn(async move {
        let request = TranslateRequest {
            text: text_to_translate,
            source_lang,
            target_lang, // move，spawn 闭包后续不再使用 target_lang。
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
        window::show_region_overlay(&app).map_err(|e| e.to_string())
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
                    let err_msg = format!("截屏失败: {}", e);
                    let app_emit = app_handle.clone();
                    dispatch_to_main(app_handle, move || {
                        let _ = app_emit.emit("region-capture-failed", serde_json::json!({
                            "error": err_msg,
                        }));
                    });
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
            // Win32/WebView2 窗口 API 非线程安全，禁止在截屏后台线程直接 show/focus。
            let app_show = app_handle.clone();
            dispatch_to_main(app_handle, move || {
                if let Err(e) = window::show_region_overlay(&app_show) {
                    eprintln!("[kitty-tools] 显示选区遮罩失败: {}", e);
                }
            });
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
    // 全部凭证在 Arc 内，spawn 时仅一次 Arc::clone（cfg 中的 baidu_ocr_*、google_vision_api_url 等已合并入袋）。
    let creds = Arc::new(TranslateCreds::from_config(cfg));
    let client = app.state::<app_state::AppState>().client.clone();

    tauri::async_runtime::spawn(async move {
        if provider == "baidu" {
            match translate::api::baidu_translate_screenshot_image(
                &client,
                &image_data,
                &source_lang,
                &target_lang,
                &creds.baidu_app_id,
                &creds.baidu_secret,
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
            // 注意：Vision OCR 用 google_vision_api_url；之前误传了 google_translate_api_url（同 host 但路径不同）。
            // 修正为正确字段，避免在用户自定义 vision URL 时识图地址被覆盖为翻译地址。
            &creds.google_vision_api_url,
            &creds.baidu_ocr_api_key,
            &creds.baidu_ocr_secret_key,
            &creds.baidu_ocr_aip_base_url,
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

                // baidu 分支（上面的 if）已经 `return`，到这里 source_lang / target_lang 不再被使用，
                // 直接 move 进 TranslateRequest 即可，省两次 String 复制。
                let request = TranslateRequest {
                    text: ocr.text,
                    source_lang,
                    target_lang,
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
            let app_main = app.clone();
            let _ = app.run_on_main_thread(move || {
                window::show_clipboard_popup(&app_main);
            });
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(app_updater::PendingAppUpdate(Mutex::new(None)))
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
            suppress_overlay_autohide: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            #[cfg(target_os = "macos")]
            suppress_macos_overlay_restore: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            // Clipboard commands
            clipboard::watcher::start_clipboard_watcher,
            show_window,
            hide_window,
            show_launcher_window,
            show_json_editor_window,
            open_hub_feature,
            open_settings_window,
            hide_settings_window,
            show_welcome_onboarding_cmd,
            exit_after_flush,
            clipboard::paste::paste_item,
            clipboard::paste::write_text_to_clipboard,
            clipboard::paste::read_text_from_clipboard,
            update_global_shortcut,
            clipboard::image_cache::get_image_preview_asset_path,
            clipboard::image_cache::prune_clipboard_image_store,
            clipboard::app_icon::get_app_icon_data_url,
            clipboard::app_icon::get_app_icons_data_url,
            clipboard::history_db::replace_clipboard_history_items,
            clipboard::history_db::apply_clipboard_history_delta,
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
            start_floating_drag,
            start_clipboard_drag,
            start_launcher_drag,
            launcher::launcher_query,
            launcher::launcher_execute,
            app_updater::check_app_update_cmd,
            app_updater::download_install_app_update_cmd,
        ])
        .setup(move |app| {
            let cfg = app_state::lock_poisoned(&*app.state::<Mutex<config::AppConfig>>()).clone();

            // Build tray（复用已加载配置，避免再次读 SQLite）
            if let Err(e) = tray::build_tray(app.handle(), &cfg) {
                eprintln!("[kitty-tools] 托盘初始化失败: {}", e);
            }

            // macOS：Dock 可见；Windows：浮层跳过任务栏
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

            // 启动时清理孤儿 preview（preview 存在但同名 .kchi 已不存在的情况）
            let _ = clipboard::image_cache::cleanup_orphan_previews(app.handle());

            // 启动器：后台预热已安装应用扫描，避免首次按下启动器快捷键时等待 walkdir。
            launcher::prewarm_in_background();

            // 翻译：后台预热 Lingua 语种检测器，避免用户首次「自动检测」翻译时同步等 build()（500-2000ms）。
            std::thread::spawn(|| {
                lang_detect::warmup_detector_blocking();
            });

            // Pre-create clipboard, floating, region-select, launcher, settings windows
            let _ = window::get_or_create_clipboard_popup_window(app.handle());
            let _ = window::get_or_create_floating_window(app.handle());
            let _ = window::get_or_create_region_select_window(app.handle());
            let _ = window::get_or_create_launcher_window(app.handle());
            let _ = window::get_or_create_settings_window(app.handle());

            // Handle hotkey events for translate pipelines
            let app_handle = app.handle().clone();
            app.listen("hotkey-selection-translate", move |_| {
                handle_selection_translate_hotkey(&app_handle);
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

            // 首次运行：在主窗口展示欢迎引导
            if first_run {
                let app_handle = app.handle().clone();
                let _ = window::present_settings_window(&app_handle);
                let _ = app_handle.emit("show-welcome-onboarding", ());
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
