//! 应用内更新：封装 tauri-plugin-updater，配置更稳健的网络客户端并在失败时回退下载。
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine as _;
use minisign_verify::{PublicKey, Signature};
use reqwest::Client;
use serde::Serialize;
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_updater::UpdaterExt;

use crate::app_state::AppState;

const UPDATER_USER_AGENT: &str = "kitty-tools-updater/1";

pub struct PendingAppUpdate(pub Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfoDto {
    pub version: String,
    pub notes: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "event", content = "data")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        content_length: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    Progress {
        chunk_length: usize,
    },
    Finished,
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    app.updater_builder()
        .configure_client(|builder| {
            builder
                .timeout(Duration::from_secs(600))
                .connect_timeout(Duration::from_secs(30))
        })
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())
}

fn updater_pubkey(app: &AppHandle) -> Result<String, String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| "未配置 updater.pubkey".to_string())
}

fn base64_to_string(base64_string: &str) -> Result<String, String> {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(base64_string)
        .map_err(|error| error.to_string())?;
    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn verify_signature(data: &[u8], release_signature: &str, pub_key: &str) -> Result<(), String> {
    let pub_key_decoded = base64_to_string(pub_key)?;
    let public_key = PublicKey::decode(&pub_key_decoded).map_err(|error| error.to_string())?;
    let signature_decoded = base64_to_string(release_signature)?;
    let signature = Signature::decode(&signature_decoded).map_err(|error| error.to_string())?;
    public_key
        .verify(data, &signature, true)
        .map_err(|error| error.to_string())
}

async fn download_with_fallback(
    update: &tauri_plugin_updater::Update,
    client: &Client,
    pubkey: &str,
    on_event: &Channel<DownloadEvent>,
) -> Result<Vec<u8>, String> {
    let url = update.download_url.to_string();
    let response = client
        .get(&url)
        .header("Accept", "application/octet-stream")
        .header("User-Agent", UPDATER_USER_AGENT)
        .send()
        .await
        .map_err(|error| format!("下载更新包失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载更新包失败（HTTP {}）",
            response.status().as_u16()
        ));
    }

    let content_length = response
        .content_length()
        .or_else(|| {
            response
                .headers()
                .get("Content-Length")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse().ok())
        });

    let _ = on_event.send(DownloadEvent::Started { content_length });

    let mut buffer = Vec::new();
    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("读取更新包失败：{error}"))?;
        let chunk_length = chunk.len();
        buffer.extend_from_slice(&chunk);
        let _ = on_event.send(DownloadEvent::Progress { chunk_length });
    }

    let _ = on_event.send(DownloadEvent::Finished);
    verify_signature(&buffer, &update.signature, pubkey)?;
    Ok(buffer)
}

#[tauri::command]
pub async fn check_app_update_cmd(
    app: AppHandle,
    pending: State<'_, PendingAppUpdate>,
) -> Result<Option<AppUpdateInfoDto>, String> {
    let updater = build_updater(&app)?;
    let update = updater
        .check()
        .await
        .map_err(|error| normalize_network_error(&error.to_string()))?;

    let Some(update) = update else {
        *pending.0.lock().map_err(|_| "更新状态锁失败".to_string())? = None;
        return Ok(None);
    };

    let dto = AppUpdateInfoDto {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        date: update.date.as_ref().map(|value| format!("{value}")),
    };

    *pending.0.lock().map_err(|_| "更新状态锁失败".to_string())? = Some(update);
    Ok(Some(dto))
}

#[tauri::command]
pub async fn download_install_app_update_cmd(
    app: AppHandle,
    pending: State<'_, PendingAppUpdate>,
    app_state: State<'_, AppState>,
    on_event: Channel<DownloadEvent>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|_| "更新状态锁失败".to_string())?
        .clone()
        .ok_or_else(|| "没有可安装的更新，请先检查更新。".to_string())?;

    let pubkey = updater_pubkey(&app)?;
    let mut first_chunk = true;
    let plugin_result = update
        .download_and_install(
            |chunk_length, content_length| {
                if first_chunk {
                    first_chunk = false;
                    let _ = on_event.send(DownloadEvent::Started { content_length });
                }
                let _ = on_event.send(DownloadEvent::Progress { chunk_length });
            },
            || {
                let _ = on_event.send(DownloadEvent::Finished);
            },
        )
        .await;

    if plugin_result.is_ok() {
        *pending.0.lock().map_err(|_| "更新状态锁失败".to_string())? = None;
        return Ok(());
    }

    let plugin_error = plugin_result
        .err()
        .map(|error| error.to_string())
        .unwrap_or_default();
    eprintln!("[app-updater] plugin download failed: {plugin_error}");

    let bytes = download_with_fallback(&update, &app_state.client, &pubkey, &on_event).await?;
    update
        .install(&bytes)
        .map_err(|error| normalize_network_error(&error.to_string()))?;
    *pending.0.lock().map_err(|_| "更新状态锁失败".to_string())? = None;
    Ok(())
}

fn normalize_network_error(message: &str) -> String {
    if message.contains("error sending request for url") {
        return "下载更新包失败，请检查网络连接、系统代理或防火墙设置后重试".to_string();
    }
    if message.contains("decoding response body") {
        return "无法读取更新信息，请确认 GitCode Release 已发布且 latest.json 可访问".to_string();
    }
    message.to_string()
}
