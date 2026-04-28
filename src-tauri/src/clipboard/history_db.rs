//! 剪贴板历史全表替换：`tauri-plugin-sql` 基于 sqlx 连接池，多次 `execute` 可能落到不同连接，
//! 无法跨调用使用 BEGIN/COMMIT。此处用 rusqlite 单连接事务，与 plugin 共用同一数据库文件。
use rusqlite::{params, Connection};
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const INSERT_SQL: &str = "\
INSERT INTO clipboard_history \
(id, type, content, content_hash, image_byte_size, file_byte_sizes, file_paths, \
image_width, image_height, timestamp, source_app, source_app_path, favorited) \
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryReplaceItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    #[serde(default)]
    pub content: String,
    pub content_hash: Option<String>,
    pub image_byte_size: Option<i64>,
    pub file_byte_sizes: Option<Vec<f64>>,
    pub file_paths: Option<Vec<String>>,
    pub image_width: Option<i64>,
    pub image_height: Option<i64>,
    pub timestamp: i64,
    pub source_app: Option<String>,
    pub source_app_path: Option<String>,
    #[serde(default)]
    pub favorited: bool,
}

fn kitty_settings_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|mut p| {
            p.push("kitty-settings.db");
            p
        })
        .map_err(|e| e.to_string())
}

fn json_opt_vec_f64(v: &Option<Vec<f64>>) -> Option<String> {
    match v {
        None => None,
        Some(x) if x.is_empty() => None,
        Some(x) => serde_json::to_string(x).ok(),
    }
}

fn json_opt_vec_string(v: &Option<Vec<String>>) -> Option<String> {
    match v {
        None => None,
        Some(x) if x.is_empty() => None,
        Some(x) => serde_json::to_string(x).ok(),
    }
}

fn replace_clipboard_history_blocking(
    path: PathBuf,
    items: Vec<ClipboardHistoryReplaceItem>,
) -> Result<(), String> {
    let mut conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM clipboard_history", [])
        .map_err(|e| e.to_string())?;

    let favorited_i = |b: bool| -> i32 {
        if b {
            1
        } else {
            0
        }
    };

    for item in &items {
        tx.execute(
            INSERT_SQL,
            params![
                item.id.as_str(),
                item.item_type.as_str(),
                item.content.as_str(),
                item.content_hash.as_deref(),
                item.image_byte_size,
                json_opt_vec_f64(&item.file_byte_sizes),
                json_opt_vec_string(&item.file_paths),
                item.image_width,
                item.image_height,
                item.timestamp,
                item.source_app.as_deref(),
                item.source_app_path.as_deref(),
                favorited_i(item.favorited),
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn replace_clipboard_history_items(
    app: AppHandle,
    items: Vec<ClipboardHistoryReplaceItem>,
) -> Result<(), String> {
    let path = kitty_settings_db_path(&app)?;
    tokio::task::spawn_blocking(move || replace_clipboard_history_blocking(path, items))
        .await
        .map_err(|e| format!("replace_clipboard_history: {e}"))?
}
