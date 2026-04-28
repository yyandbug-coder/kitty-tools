//! 剪贴板历史全表替换：`tauri-plugin-sql` 基于 sqlx 连接池，多次 `execute` 可能落到不同连接，
//! 无法跨调用使用 BEGIN/COMMIT。此处用 rusqlite 单连接事务，与 plugin 共用同一数据库文件。
//!
//! 数据库路径必须与前端 `Database.load("sqlite:kitty-settings.db")` 一致：即
//! `app.path().app_config_dir()` + `kitty-settings.db`（与 `tauri-plugin-sql` 的 path_mapper 相同）。
use rusqlite::Connection;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const INSERT_COLS: &str =
    "id, type, content, content_hash, image_byte_size, file_byte_sizes, file_paths, image_width, image_height, timestamp, source_app, source_app_path, favorited";

/// 每批行数 ×13 列占位，变量总数须低于 SQLite 默认上限（通常为 999）。
const BATCH_ROWS: usize = 52;

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
    /// 前端合并/旧数据可能为 `null`；仅用 `#[serde(default)] bool` 无法反序列化 JSON null。
    #[serde(default)]
    pub favorited: Option<bool>,
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

fn favorited_i(b: bool) -> i32 {
    if b {
        1
    } else {
        0
    }
}

fn build_batch_insert_sql(chunk_len: usize) -> String {
    let placeholders = (0..chunk_len)
        .map(|ri| {
            let o = ri * 13;
            format!(
                "(${},{},{},{},{},{},{},{},{},{},{},{},{})",
                o + 1,
                o + 2,
                o + 3,
                o + 4,
                o + 5,
                o + 6,
                o + 7,
                o + 8,
                o + 9,
                o + 10,
                o + 11,
                o + 12,
                o + 13
            )
        })
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "INSERT INTO clipboard_history ({INSERT_COLS}) VALUES {placeholders}"
    )
}

fn append_row_params<'a>(
    args: &mut Vec<rusqlite::types::Value>,
    item: &'a ClipboardHistoryReplaceItem,
) {
    args.push(rusqlite::types::Value::Text(item.id.clone()));
    args.push(rusqlite::types::Value::Text(item.item_type.clone()));
    args.push(rusqlite::types::Value::Text(item.content.clone()));
    args.push(match &item.content_hash {
        Some(s) => rusqlite::types::Value::Text(s.clone()),
        None => rusqlite::types::Value::Null,
    });
    args.push(match item.image_byte_size {
        Some(n) => rusqlite::types::Value::Integer(n),
        None => rusqlite::types::Value::Null,
    });
    args.push(match json_opt_vec_f64(&item.file_byte_sizes) {
        Some(s) => rusqlite::types::Value::Text(s),
        None => rusqlite::types::Value::Null,
    });
    args.push(match json_opt_vec_string(&item.file_paths) {
        Some(s) => rusqlite::types::Value::Text(s),
        None => rusqlite::types::Value::Null,
    });
    args.push(match item.image_width {
        Some(n) => rusqlite::types::Value::Integer(n),
        None => rusqlite::types::Value::Null,
    });
    args.push(match item.image_height {
        Some(n) => rusqlite::types::Value::Integer(n),
        None => rusqlite::types::Value::Null,
    });
    args.push(rusqlite::types::Value::Integer(item.timestamp));
    args.push(match &item.source_app {
        Some(s) => rusqlite::types::Value::Text(s.clone()),
        None => rusqlite::types::Value::Null,
    });
    args.push(match &item.source_app_path {
        Some(s) => rusqlite::types::Value::Text(s.clone()),
        None => rusqlite::types::Value::Null,
    });
    args.push(rusqlite::types::Value::Integer(i64::from(favorited_i(
        item.favorited.unwrap_or(false),
    ))));
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

    for chunk in items.chunks(BATCH_ROWS) {
        let sql = build_batch_insert_sql(chunk.len());
        let mut flat: Vec<rusqlite::types::Value> =
            Vec::with_capacity(chunk.len().saturating_mul(13));
        for item in chunk {
            append_row_params(&mut flat, item);
        }
        let par = rusqlite::params_from_iter(flat.iter());
        tx.execute(&sql, par).map_err(|e| e.to_string())?;
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
    match tokio::task::spawn_blocking(move || replace_clipboard_history_blocking(path, items)).await {
        Ok(inner) => inner,
        Err(e) => Err(format!("replace_clipboard_history join: {e}")),
    }
}
