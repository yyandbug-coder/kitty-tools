//! 剪贴板历史全表替换：`tauri-plugin-sql` 基于 sqlx 连接池，多次 `execute` 可能落到不同连接，
//! 无法跨调用使用 BEGIN/COMMIT。此处用 rusqlite 单连接事务，与 plugin 共用同一数据库文件。
//!
//! 数据库路径必须与前端 `Database.load("sqlite:kitty-settings.db")` 一致：即
//! `app.path().app_config_dir()` + `kitty-settings.db`（与 `tauri-plugin-sql` 的 path_mapper 相同）。
//!
//! 连接首次创建后驻留进程并通过 `Mutex` 串行化写入（前端侧 `clipboardReplaceQueue` 已串行化，
//! 但仍通过 `busy_timeout` + WAL 抗住与 plugin-sql 池外连接的写争用）。
use rusqlite::Connection;
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
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

#[cfg(test)]
mod tests {
    use super::{build_batch_insert_sql, build_batch_upsert_sql};

    #[test]
    fn batch_insert_sql_one_row_thirteen_placeholders() {
        let s = build_batch_insert_sql(1);
        assert!(s.contains("?1,"), "{}", s);
        assert!(s.contains("?13)"), "{}", s);
        assert!(!s.contains("?14"), "{}", s);
    }

    #[test]
    fn batch_insert_sql_two_rows_twenty_six_placeholders() {
        let s = build_batch_insert_sql(2);
        assert!(s.contains("?13), (?14"), "{}", s);
        assert!(s.ends_with("?26)"), "{}", s);
    }

    #[test]
    fn batch_upsert_sql_has_on_conflict_clause() {
        let s = build_batch_upsert_sql(1);
        assert!(s.contains("ON CONFLICT(id) DO UPDATE"), "{}", s);
        assert!(s.contains("favorited=excluded.favorited"), "{}", s);
        assert!(s.contains("?13)"), "{}", s);
    }
}

fn build_batch_insert_sql(chunk_len: usize) -> String {
    // 须使用 `?1,?2,…`（或每个参数前都有 `$`）。原先写成 `(${},{},…)` 只会在第一个数前产生 `$`，
    // 得到 `($1,2,3,…,13)`：SQLite 仅识别 `$1`，`params_from_iter` 与占位符数量不一致 → 保存失败。
    let placeholders = (0..chunk_len)
        .map(|ri| {
            let o = ri * 13;
            format!(
                "(?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{})",
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
    format!("INSERT INTO clipboard_history ({INSERT_COLS}) VALUES {placeholders}")
}

fn append_row_params(
    args: &mut Vec<rusqlite::types::Value>,
    item: &ClipboardHistoryReplaceItem,
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

fn build_batch_upsert_sql(chunk_len: usize) -> String {
    // INSERT … VALUES … ON CONFLICT(id) DO UPDATE，配合 13 列占位串。
    // SQLite 的 excluded.col 表示同一行中“被插入的新值”。
    let placeholders = (0..chunk_len)
        .map(|ri| {
            let o = ri * 13;
            format!(
                "(?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{},?{})",
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
        "INSERT INTO clipboard_history ({INSERT_COLS}) VALUES {placeholders} \
         ON CONFLICT(id) DO UPDATE SET \
            type=excluded.type, \
            content=excluded.content, \
            content_hash=excluded.content_hash, \
            image_byte_size=excluded.image_byte_size, \
            file_byte_sizes=excluded.file_byte_sizes, \
            file_paths=excluded.file_paths, \
            image_width=excluded.image_width, \
            image_height=excluded.image_height, \
            timestamp=excluded.timestamp, \
            source_app=excluded.source_app, \
            source_app_path=excluded.source_app_path, \
            favorited=excluded.favorited"
    )
}

/// (连接路径, Mutex<Connection>)。首次按 path 创建后保持，避免每次写库都重开 SQLite。
/// 路径在用户登录会话内不会变化；若极端情况下 path 真变（多 profile？），重新初始化即可。
static CONN: OnceLock<Mutex<(PathBuf, Connection)>> = OnceLock::new();

fn ensure_connection(path: &std::path::Path) -> Result<&'static Mutex<(PathBuf, Connection)>, String> {
    if let Some(slot) = CONN.get() {
        let guard = slot.lock().map_err(|e| e.to_string())?;
        if guard.0 == path {
            drop(guard);
            return Ok(slot);
        }
    }
    let conn = open_history_connection(path)?;
    let _ = CONN.set(Mutex::new((path.to_path_buf(), conn)));
    let slot = CONN.get().expect("CONN just initialized");
    // path 切换：复位为新连接。
    {
        let mut guard = slot.lock().map_err(|e| e.to_string())?;
        if guard.0 != path {
            guard.1 = open_history_connection(path)?;
            guard.0 = path.to_path_buf();
        }
    }
    Ok(slot)
}

fn open_history_connection(path: &std::path::Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    // WAL：与前端 `database.ts` 在 plugin-sql 通道开启的 PRAGMA 一致；synchronous=NORMAL
    // 在 WAL 下足够安全且写入更快。`PRAGMA` 用 `pragma_update` 走查询接口避免被其它 PRAGMA 影响。
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    Ok(conn)
}

fn replace_clipboard_history_blocking(
    path: PathBuf,
    items: Vec<ClipboardHistoryReplaceItem>,
) -> Result<(), String> {
    let slot = ensure_connection(&path)?;
    let mut guard = slot.lock().map_err(|e| e.to_string())?;
    let conn = &mut guard.1;

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

fn apply_clipboard_history_delta_blocking(
    path: PathBuf,
    upserts: Vec<ClipboardHistoryReplaceItem>,
    deletes: Vec<String>,
) -> Result<(), String> {
    if upserts.is_empty() && deletes.is_empty() {
        return Ok(());
    }
    let slot = ensure_connection(&path)?;
    let mut guard = slot.lock().map_err(|e| e.to_string())?;
    let conn = &mut guard.1;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if !deletes.is_empty() {
        // SQLite 默认参数上限 999；分批 DELETE … WHERE id IN (?, ?, …)。
        const DELETE_BATCH: usize = 500;
        for chunk in deletes.chunks(DELETE_BATCH) {
            let placeholders = (0..chunk.len())
                .map(|i| format!("?{}", i + 1))
                .collect::<Vec<_>>()
                .join(",");
            let sql = format!(
                "DELETE FROM clipboard_history WHERE id IN ({placeholders})"
            );
            let params: Vec<rusqlite::types::Value> = chunk
                .iter()
                .map(|s| rusqlite::types::Value::Text(s.clone()))
                .collect();
            tx.execute(&sql, rusqlite::params_from_iter(params.iter()))
                .map_err(|e| e.to_string())?;
        }
    }

    if !upserts.is_empty() {
        for chunk in upserts.chunks(BATCH_ROWS) {
            let sql = build_batch_upsert_sql(chunk.len());
            let mut flat: Vec<rusqlite::types::Value> =
                Vec::with_capacity(chunk.len().saturating_mul(13));
            for item in chunk {
                append_row_params(&mut flat, item);
            }
            let par = rusqlite::params_from_iter(flat.iter());
            tx.execute(&sql, par).map_err(|e| e.to_string())?;
        }
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

#[tauri::command]
pub async fn apply_clipboard_history_delta(
    app: AppHandle,
    upserts: Vec<ClipboardHistoryReplaceItem>,
    deletes: Vec<String>,
) -> Result<(), String> {
    let path = kitty_settings_db_path(&app)?;
    match tokio::task::spawn_blocking(move || {
        apply_clipboard_history_delta_blocking(path, upserts, deletes)
    })
    .await
    {
        Ok(inner) => inner,
        Err(e) => Err(format!("apply_clipboard_history_delta join: {e}")),
    }
}
