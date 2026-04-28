//! 记录通过启动器打开的 URL，用于书签等结果的排序（最近打开的靠前）。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::app_state::lock_poisoned;

#[derive(Default, Serialize, Deserialize, Clone)]
struct RecencyStore {
    /// 规范化后的 URL -> 上次从启动器打开时的 Unix 毫秒时间戳
    url_last_ms: HashMap<String, i64>,
}

static STORE: OnceLock<Mutex<RecencyStore>> = OnceLock::new();

fn store_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("kitty-tools")
        .join("launcher_url_recency.json")
}

fn ensure_store() -> &'static Mutex<RecencyStore> {
    STORE.get_or_init(|| {
        let path = store_path();
        let mut data = RecencyStore::default();
        if let Ok(txt) = fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str(&txt) {
                data = parsed;
            }
        }
        Mutex::new(data)
    })
}

fn persist(store: &RecencyStore) {
    let path = store_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(txt) = serde_json::to_string_pretty(store) {
        let _ = fs::write(path, txt);
    }
}

fn normalize_url_key(url: &str) -> String {
    url.trim().to_lowercase()
}

/// 启动器成功打开 URL 后调用；仅记录 http(s)，与书签/「在浏览器中打开」一致。
pub fn record_url_opened(payload: &str) {
    let t = payload.trim();
    if !t.starts_with("http://") && !t.starts_with("https://") {
        return;
    }
    let key = normalize_url_key(t);
    let now = chrono::Utc::now().timestamp_millis();
    let snapshot = {
        let mut g = lock_poisoned(ensure_store());
        g.url_last_ms.insert(key, now);
        g.clone()
    };
    persist(&snapshot);
}

/// 用于排序：越大表示越晚打开过；未打开过为 0。
pub fn url_last_opened_ms(url: &str) -> i64 {
    let key = normalize_url_key(url);
    let g = lock_poisoned(ensure_store());
    g.url_last_ms.get(&key).copied().unwrap_or(0)
}
