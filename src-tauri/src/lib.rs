#![allow(clippy::needless_pass_by_value)]

pub mod features {
    pub mod clipboard_history;
    pub mod translate;
}

use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent};
const WORKSPACE_EVENT: &str = "workspace:navigate";
const MAIN_WINDOW_LABEL: &str = "main";
const ONBOARDING_WINDOW_LABEL: &str = "onboarding";
const TRAY_ID: &str = "kitty-utils-tray";
const TRAY_OPEN_SETTINGS_ID: &str = "tray-open-settings";
const TRAY_OPEN_CLIPBOARD_ID: &str = "tray-open-clipboard";
const TRAY_SELECTION_ID: &str = "tray-selection";
const TRAY_SCREENSHOT_ID: &str = "tray-screenshot";
const TRAY_QUIT_ID: &str = "tray-quit";

fn normalize_module(module: Option<String>) -> &'static str {
    match module.as_deref() {
        Some("clipboard") | Some("clipboard-history") => "clipboard-history",
        Some("settings") => "settings",
        _ => "translate",
    }
}

fn open_workspace(app: &AppHandle, module: Option<String>) -> Result<(), String> {
    let target_module = normalize_module(module);
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main workspace window not found".to_string())?;

    window
        .show()
        .map_err(|e| format!("Show workspace error: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Focus workspace error: {}", e))?;
    let _ = app.emit(WORKSPACE_EVENT, target_module);
    Ok(())
}

fn onboarding_url() -> tauri::WebviewUrl {
    if cfg!(debug_assertions) {
        tauri::WebviewUrl::External(
            "http://localhost:1420/onboarding.html"
                .parse()
                .expect("invalid onboarding dev url"),
        )
    } else {
        tauri::WebviewUrl::App("onboarding.html".into())
    }
}

fn get_or_create_onboarding_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(ONBOARDING_WINDOW_LABEL) {
        return Ok(window);
    }

    let window = tauri::WebviewWindow::builder(app, ONBOARDING_WINDOW_LABEL, onboarding_url())
        .title("Kitty Utils · 欢迎")
        .inner_size(1080.0, 820.0)
        .min_inner_size(920.0, 720.0)
        .resizable(true)
        .decorations(false)
        .center()
        .visible(false)
        .build()
        .map_err(|e| format!("Create onboarding window error: {}", e))?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });

    Ok(window)
}

fn show_onboarding(app: &AppHandle) -> Result<(), String> {
    let window = get_or_create_onboarding_window(app)?;
    window
        .show()
        .map_err(|e| format!("Show onboarding error: {}", e))?;
    window
        .set_focus()
        .map_err(|e| format!("Focus onboarding error: {}", e))?;
    Ok(())
}

#[tauri::command]
fn app_open_workspace(app: tauri::AppHandle, module: Option<String>) -> Result<(), String> {
    open_workspace(&app, module)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open_settings_item =
        MenuItemBuilder::with_id(TRAY_OPEN_SETTINGS_ID, "打开设置").build(app)?;
    let open_clipboard_item =
        MenuItemBuilder::with_id(TRAY_OPEN_CLIPBOARD_ID, "打开历史记录面板").build(app)?;
    let selection_translate = MenuItemBuilder::with_id(TRAY_SELECTION_ID, "划词翻译").build(app)?;
    let screenshot_translate =
        MenuItemBuilder::with_id(TRAY_SCREENSHOT_ID, "截图翻译").build(app)?;
    let quit_item = MenuItemBuilder::with_id(TRAY_QUIT_ID, "退出").build(app)?;
    let separator_top = PredefinedMenuItem::separator(app)?;
    let separator_bottom = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_settings_item,
            &open_clipboard_item,
            &separator_top,
            &selection_translate,
            &screenshot_translate,
            &separator_bottom,
            &quit_item,
        ],
    )?;

    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Kitty Utils")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_SETTINGS_ID => {
                let _ = open_workspace(app, Some("settings".to_string()));
            }
            TRAY_OPEN_CLIPBOARD_ID => features::clipboard_history::show_clipboard_panel(app),
            TRAY_SELECTION_ID => {
                if let Err(error) = features::translate::trigger_selection_translate(app) {
                    eprintln!("[kitty-utils] selection translate failed: {}", error);
                }
            }
            TRAY_SCREENSHOT_ID => {
                if let Err(error) = features::translate::trigger_screenshot_translate(app) {
                    eprintln!("[kitty-utils] screenshot translate failed: {}", error);
                }
            }
            TRAY_QUIT_ID => features::clipboard_history::request_flush_then_exit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = tray.app_handle();
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    features::translate::maybe_handle_global_shortcut(app, shortcut, event.state());
                })
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(features::translate::build_state())
        .invoke_handler(tauri::generate_handler![
            app_open_workspace,
            features::clipboard_history::window_show_clipboard_panel,
            features::clipboard_history::window_hide_clipboard_panel,
            features::clipboard_history::clipboard_exit_after_flush,
            features::clipboard_history::clipboard_update_shortcut,
            features::clipboard_history::clipboard_start_watcher,
            features::clipboard_history::clipboard_paste_item,
            features::clipboard_history::clipboard_get_image_preview_asset_path,
            features::clipboard_history::clipboard_prune_image_store,
            features::clipboard_history::clipboard_get_app_icon_data_url,
            features::translate::translate_text,
            features::translate::translate_test_connection,
            features::translate::translate_start_screenshot,
            features::translate::translate_region_overlay_cancel,
            features::translate::translate_region_overlay_complete,
            features::translate::translate_selection,
            features::translate::translate_get_settings,
            features::translate::translate_save_settings,
            features::translate::translate_ocr_image,
            features::translate::translate_hide_floating_window,
            features::translate::window_show_translate_floating,
            features::translate::translate_floating_ready,
        ])
        .setup(|app| {
            build_tray(&app.handle())?;
            features::translate::setup(&app.handle()).map_err(std::io::Error::other)?;
            features::clipboard_history::setup(&app.handle()).map_err(std::io::Error::other)?;

            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.hide();
            }

            if features::translate::is_first_run(&app.handle()) {
                let _ = show_onboarding(&app.handle());
            }

            Ok(())
        });

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if features::translate::is_first_run(&app) {
                let _ = show_onboarding(&app);
            }
        }));
    }

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if features::clipboard_history::consume_allow_exit() {
                    return;
                }
                api.prevent_exit();
            }
        });
}
