//! 使用本地 SQLite 持久化完整 `AppConfig`（含各厂商 API 地址与密钥）。

use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;

use super::config::AppConfig;

fn app_data_kitty_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("kitty-utils").join("translate");
    fs::create_dir_all(&dir).ok();
    dir
}

fn sqlite_path() -> PathBuf {
    app_data_kitty_dir().join("app_config.sqlite3")
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS app_config (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            payload TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("SQLite 初始化失败: {}", e))?;
    Ok(())
}

fn save_to_sqlite_conn(conn: &Connection, config: &AppConfig) -> Result<(), String> {
    let json = serde_json::to_string(config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO app_config (singleton, payload) VALUES (1, ?1)",
        [&json],
    )
    .map_err(|e| format!("写入 SQLite 失败: {}", e))?;
    Ok(())
}

/// 从 SQLite 读取已保存配置；无记录、空数据或 JSON 损坏时返回错误（由上层回退为默认配置）。
pub fn load_from_sqlite() -> Result<AppConfig, String> {
    let path = sqlite_path();
    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;
    ensure_schema(&conn)?;

    let payload: Option<String> = {
        let mut stmt = conn
            .prepare("SELECT payload FROM app_config WHERE singleton = 1")
            .map_err(|e| format!("读取配置失败: {}", e))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| format!("读取配置失败: {}", e))?;
        match rows.next().map_err(|e| format!("读取配置失败: {}", e))? {
            Some(row) => Some(row.get::<_, String>(0).map_err(|e| format!("读取配置失败: {}", e))?),
            None => None,
        }
    };

    let Some(json) = payload.filter(|s| !s.trim().is_empty()) else {
        return Err("本地尚无已存配置".to_string());
    };

    super::config::parse_stored_config_json(&json)
}

pub fn save_to_sqlite(config: &AppConfig) -> Result<(), String> {
    let path = sqlite_path();
    let conn = Connection::open(&path).map_err(|e| format!("打开数据库失败: {}", e))?;
    ensure_schema(&conn)?;
    save_to_sqlite_conn(&conn, config)
}
