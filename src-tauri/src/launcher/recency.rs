//! 启动器全局 **frecency**：以 `(kind, payload)` 维度记录 `(count, last_ms)`，
//! 用于书签 / 系统应用 / 已安装应用 / `find`·`open` 文件等结果的重排
//! （score = count × exp(-Δdays / 14)，14 天半衰期是常见 frecency 设置）。
//!
//! 设计要点：
//! - 内存中以 `Arc<HashMap>` 持有，按键路径只 `Arc::clone` 不 deep-clone。
//! - 写入走 COW：克隆内部 map → 修改 → 原子替换 Arc。
//! - 落盘在独立线程，不阻塞 Tauri 命令链。
//! - 容量上限 [`MAX_ENTRIES`]；溢出时按当前 score 淘汰最低分，避免 ad-hoc
//!   `find`/`open` 路径长期积累。
//! - 旧版 `launcher_url_recency.json` 在首次启动时迁移到 `launcher_frecency.json`：
//!   每个旧 URL 视作一次开启（count=1），保留原 `last_ms`。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::app_state::lock_poisoned;

/// 内存表中允许的最大条数；触顶时按 score 淘汰最低分。
const MAX_ENTRIES: usize = 1024;
/// 频次衰减半衰期（天）。
const HALF_LIFE_DAYS: f64 = 14.0;

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
pub(crate) struct FrecencyEntry {
    pub count: u32,
    pub last_ms: i64,
}

#[derive(Default)]
struct FrecencyStore {
    items: Arc<HashMap<String, FrecencyEntry>>,
}

#[derive(Default, Serialize, Deserialize)]
struct FrecencyDisk {
    #[serde(default)]
    items: HashMap<String, FrecencyEntry>,
}

static STORE: OnceLock<Mutex<FrecencyStore>> = OnceLock::new();

fn config_root() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("kitty-tools")
}

fn store_path() -> PathBuf {
    config_root().join("launcher_frecency.json")
}

fn legacy_url_recency_path() -> PathBuf {
    config_root().join("launcher_url_recency.json")
}

fn ensure_store() -> &'static Mutex<FrecencyStore> {
    STORE.get_or_init(|| {
        if let Some(disk) = read_disk(&store_path()) {
            return Mutex::new(FrecencyStore {
                items: Arc::new(disk.items),
            });
        }
        // 首次升级：从旧版 URL recency 迁移。
        if let Some(legacy) = read_legacy_url_recency() {
            let mut items = HashMap::with_capacity(legacy.len());
            for (url, last_ms) in legacy {
                items.insert(
                    key_for("open_url", &url),
                    FrecencyEntry { count: 1, last_ms },
                );
            }
            let migrated = Arc::new(items);
            // 立即落盘一次新格式；不阻塞主流程，失败也无所谓（下次还会再尝试）。
            let snapshot = Arc::clone(&migrated);
            std::thread::spawn(move || persist_snapshot(snapshot));
            return Mutex::new(FrecencyStore { items: migrated });
        }
        Mutex::new(FrecencyStore::default())
    })
}

fn read_disk(path: &Path) -> Option<FrecencyDisk> {
    let txt = fs::read_to_string(path).ok()?;
    serde_json::from_str(&txt).ok()
}

fn read_legacy_url_recency() -> Option<HashMap<String, i64>> {
    #[derive(Deserialize)]
    struct LegacyDisk {
        #[serde(default)]
        url_last_ms: HashMap<String, i64>,
    }
    let txt = fs::read_to_string(legacy_url_recency_path()).ok()?;
    let parsed: LegacyDisk = serde_json::from_str(&txt).ok()?;
    if parsed.url_last_ms.is_empty() {
        return None;
    }
    Some(parsed.url_last_ms)
}

fn persist_snapshot(snapshot: Arc<HashMap<String, FrecencyEntry>>) {
    let path = store_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let disk = FrecencyDisk {
        items: (*snapshot).clone(),
    };
    if let Ok(txt) = serde_json::to_string_pretty(&disk) {
        let _ = fs::write(path, txt);
    }
}

/// 标准化「kind + payload」为 `HashMap` 键。`open_url` 会忽略 URL 大小写差异；
/// 其它 kind 仅 `trim`，保留原大小写以便 `\foo\Bar.exe` 与 `\foo\bar.exe` 视为不同项。
pub(crate) fn key_for(kind: &str, payload: &str) -> String {
    let normalized = if kind == "open_url" {
        payload.trim().to_lowercase()
    } else {
        payload.trim().to_string()
    };
    format!("{kind}::{normalized}")
}

/// 一次性获取 `Arc<HashMap>` 快照：读取者迭代期间不受写入影响，按键路径仅 `Arc::clone`。
pub(crate) fn snapshot() -> Arc<HashMap<String, FrecencyEntry>> {
    Arc::clone(&lock_poisoned(ensure_store()).items)
}

/// frecency 评分：`count * exp(-Δdays / HALF_LIFE_DAYS)`。
/// 取相对当前时间衰减，越久未使用的 entry 分数越低。
pub(crate) fn score(now_ms: i64, e: &FrecencyEntry) -> f64 {
    let age_days = ((now_ms - e.last_ms) as f64 / 86_400_000.0).max(0.0);
    (e.count as f64) * (-age_days / HALF_LIFE_DAYS).exp()
}

/// 在已有快照中查 `(kind, payload)` 的 frecency 分；不存在返回 0。
pub(crate) fn score_or_zero(
    snap: &HashMap<String, FrecencyEntry>,
    now_ms: i64,
    kind: &str,
    payload: &str,
) -> f64 {
    let key = key_for(kind, payload);
    snap.get(&key).map(|e| score(now_ms, e)).unwrap_or(0.0)
}

/// 启动器成功执行后调用：累加 count、刷新 last_ms；超出容量上限按 score 淘汰最低分。
/// 内存即时生效，落盘走独立线程。
pub fn record(kind: &str, payload: &str) {
    let trimmed = payload.trim();
    if trimmed.is_empty() {
        return;
    }
    let key = key_for(kind, trimmed);
    let now = chrono::Utc::now().timestamp_millis();
    let snapshot = {
        let mut g = lock_poisoned(ensure_store());
        let mut new_map: HashMap<String, FrecencyEntry> = (*g.items).clone();
        let entry = new_map
            .entry(key)
            .or_insert(FrecencyEntry { count: 0, last_ms: now });
        entry.count = entry.count.saturating_add(1);
        entry.last_ms = now;
        if new_map.len() > MAX_ENTRIES {
            prune_lowest_scoring(&mut new_map, now);
        }
        g.items = Arc::new(new_map);
        Arc::clone(&g.items)
    };
    std::thread::spawn(move || persist_snapshot(snapshot));
}

fn prune_lowest_scoring(map: &mut HashMap<String, FrecencyEntry>, now_ms: i64) {
    while map.len() > MAX_ENTRIES {
        let Some(victim_key) = map
            .iter()
            .min_by(|(_, a), (_, b)| {
                score(now_ms, a)
                    .partial_cmp(&score(now_ms, b))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(k, _)| k.clone())
        else {
            break;
        };
        map.remove(&victim_key);
    }
}
