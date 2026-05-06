//! 从 Chromium 系浏览器的 `Bookmarks` JSON 读取书签（按设置项启用）。
//!
//! 书签文件可能很大；原先每次按键都整文件读取 + JSON 解析 + 对每条书签重复 `to_lowercase`，
//! 且排序时对每条结果反复加锁读 recency，会导致启动器明显卡顿。此处对「展开后的书签行」做
//! 磁盘 mtime 签名缓存，并预计算小写字段。

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::{Duration, Instant};

use serde_json::Value;

use super::recency;
use super::LauncherItem;

/// 书签源「只在 TTL 到期后才 stat 文件」：在连续输入场景下避免每键击都去
/// 调 6+ 个 Bookmarks 文件的 `metadata().modified()`。
const BOOKMARK_VERIFY_TTL: Duration = Duration::from_secs(30);

#[derive(Clone)]
struct BookmarkFlatRow {
    title: String,
    title_lower: String,
    url: String,
    url_lower: String,
    src: &'static str,
}

struct BookmarkFlatCache {
    sig: u64,
    /// 上次“签名验证”的时间点（后续在 TTL 内跳过重新 stat）。
    last_verified_at: Instant,
    rows: Arc<Vec<BookmarkFlatRow>>,
}

static FLAT_CACHE: RwLock<Option<BookmarkFlatCache>> = RwLock::new(None);

fn hash_path_fingerprint(path: &Path, hasher: &mut impl Hasher) {
    path.hash(hasher);
    if let Ok(meta) = std::fs::metadata(path) {
        meta.len().hash(hasher);
        if let Ok(t) = meta.modified() {
            t.hash(hasher);
        }
    }
}

/// 浏览器开关 + 各 Bookmarks 文件路径与 mtime/大小，任一变化则重建缓存。
fn bookmark_sources_signature(chrome: bool, edge: bool, brave: bool) -> u64 {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    chrome.hash(&mut h);
    edge.hash(&mut h);
    brave.hash(&mut h);
    if chrome {
        for path in chromium_bookmark_files(&chrome_user_data()) {
            hash_path_fingerprint(&path, &mut h);
        }
    }
    if edge {
        for path in chromium_bookmark_files(&edge_user_data()) {
            hash_path_fingerprint(&path, &mut h);
        }
    }
    if brave {
        for path in chromium_bookmark_files(&brave_user_data()) {
            hash_path_fingerprint(&path, &mut h);
        }
    }
    h.finish()
}

fn load_all_flat_rows(chrome: bool, edge: bool, brave: bool) -> Vec<BookmarkFlatRow> {
    let mut flat: Vec<(String, String, &'static str)> = Vec::new();
    if chrome {
        for path in chromium_bookmark_files(&chrome_user_data()) {
            if let Ok(entries) = load_bookmark_file(&path) {
                for (t, u) in entries {
                    flat.push((t, u, "Chrome"));
                }
            }
        }
    }
    if edge {
        for path in chromium_bookmark_files(&edge_user_data()) {
            if let Ok(entries) = load_bookmark_file(&path) {
                for (t, u) in entries {
                    flat.push((t, u, "Edge"));
                }
            }
        }
    }
    if brave {
        for path in chromium_bookmark_files(&brave_user_data()) {
            if let Ok(entries) = load_bookmark_file(&path) {
                for (t, u) in entries {
                    flat.push((t, u, "Brave"));
                }
            }
        }
    }

    let mut seen_url = HashSet::<String>::new();
    let mut rows = Vec::with_capacity(flat.len());
    for (title, url, src) in flat {
        if !seen_url.insert(url.clone()) {
            continue;
        }
        let title_lower = title.to_lowercase();
        let url_lower = url.to_lowercase();
        rows.push(BookmarkFlatRow {
            title,
            title_lower,
            url,
            url_lower,
            src,
        });
    }
    rows
}

fn cached_flat_rows(chrome: bool, edge: bool, brave: bool) -> Arc<Vec<BookmarkFlatRow>> {
    // 热路径：TTL 未到期直接返回缓存，不走 metadata 抓取。
    if let Ok(g) = FLAT_CACHE.read() {
        if let Some(c) = g.as_ref() {
            if c.last_verified_at.elapsed() < BOOKMARK_VERIFY_TTL {
                return Arc::clone(&c.rows);
            }
        }
    }
    // TTL 过期或首次使用：重新计算签名。
    let sig = bookmark_sources_signature(chrome, edge, brave);
    if let Ok(mut g) = FLAT_CACHE.write() {
        if let Some(c) = g.as_mut() {
            if c.sig == sig {
                // 签名未变：仅“点亮”验证时间后返回。
                c.last_verified_at = Instant::now();
                return Arc::clone(&c.rows);
            }
        }
    }
    // 签名不一致或无缓存：重建。允许加载在写锁外完成以减轻阻塞。
    let rows = Arc::new(load_all_flat_rows(chrome, edge, brave));
    if let Ok(mut g) = FLAT_CACHE.write() {
        if let Some(c) = g.as_ref() {
            if c.sig == sig {
                return Arc::clone(&c.rows);
            }
        }
        *g = Some(BookmarkFlatCache {
            sig,
            last_verified_at: Instant::now(),
            rows: Arc::clone(&rows),
        });
    }
    rows
}

/// 书签结果的最终展示上限（与原行为保持一致）。
const BOOKMARK_MAX_OUT: usize = 50;
/// 候选规模软上限：扫到这个量就停，避免对超大书签库排序整整一遍只为前 50 条。
const BOOKMARK_MAX_CANDIDATES: usize = 256;

pub fn bookmark_items_for_query(
    query: &str,
    chrome: bool,
    edge: bool,
    brave: bool,
) -> Vec<LauncherItem> {
    let q = query.trim();
    if q.is_empty() {
        return vec![];
    }
    let q_lower = q.to_lowercase();

    if !chrome && !edge && !brave {
        return vec![];
    }

    let rows = cached_flat_rows(chrome, edge, brave);
    let frecency = recency::snapshot();
    let now_ms = chrono::Utc::now().timestamp_millis();

    let mut out: Vec<LauncherItem> = Vec::with_capacity(BOOKMARK_MAX_CANDIDATES.min(rows.len()));
    for row in rows.iter() {
        if !row.title_lower.contains(&q_lower) && !row.url_lower.contains(&q_lower) {
            continue;
        }
        let mut h = std::collections::hash_map::DefaultHasher::new();
        row.url.hash(&mut h);
        let id = format!("bm-{}-{:x}", row.src, h.finish());
        out.push(LauncherItem {
            id,
            title: row.title.clone(),
            subtitle: format!("书签 · {}", row.src),
            kind: "open_url".into(),
            payload: row.url.clone(),
            icon_path: None,
        });
        if out.len() >= BOOKMARK_MAX_CANDIDATES {
            break;
        }
    }
    out.sort_by(|a, b| {
        let sa = recency::score_or_zero(&frecency, now_ms, &a.kind, &a.payload);
        let sb = recency::score_or_zero(&frecency, now_ms, &b.kind, &b.payload);
        // 分数高者靠前；分数完全相同（含两侧均为 0）按标题字典序，与旧版保持一致。
        sb.partial_cmp(&sa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.title.cmp(&b.title))
    });
    out.truncate(BOOKMARK_MAX_OUT);
    out
}

fn chrome_user_data() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        Some(Path::new(&local).join("Google").join("Chrome").join("User Data"))
    }
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()?;
        Some(home.join("Library/Application Support/Google/Chrome"))
    }
    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir()?;
        Some(home.join(".config").join("google-chrome"))
    }
    #[cfg(all(not(windows), not(target_os = "macos"), not(target_os = "linux")))]
    {
        None
    }
}

fn edge_user_data() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        Some(Path::new(&local).join("Microsoft").join("Edge").join("User Data"))
    }
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()?;
        Some(home.join("Library/Application Support/Microsoft Edge"))
    }
    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir()?;
        Some(
            home.join(".config")
                .join("microsoft-edge"),
        )
    }
    #[cfg(all(not(windows), not(target_os = "macos"), not(target_os = "linux")))]
    {
        None
    }
}

fn brave_user_data() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let local = std::env::var("LOCALAPPDATA").ok()?;
        Some(
            Path::new(&local)
                .join("BraveSoftware")
                .join("Brave-Browser")
                .join("User Data"),
        )
    }
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()?;
        Some(
            home.join("Library/Application Support/BraveSoftware/Brave-Browser"),
        )
    }
    #[cfg(target_os = "linux")]
    {
        let home = dirs::home_dir()?;
        Some(home.join(".config").join("BraveSoftware").join("Brave-Browser"))
    }
    #[cfg(all(not(windows), not(target_os = "macos"), not(target_os = "linux")))]
    {
        None
    }
}

fn chromium_bookmark_files(user_data: &Option<PathBuf>) -> Vec<PathBuf> {
    let Some(root) = user_data else {
        return vec![];
    };
    if !root.is_dir() {
        return vec![];
    }
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(root) {
        for e in rd.flatten() {
            let p = e.path();
            let os = e.file_name();
            let n = os.to_string_lossy();
            if n == "Default" || n.starts_with("Profile ") {
                let bm = p.join("Bookmarks");
                if bm.is_file() {
                    out.push(bm);
                }
            }
        }
    }
    out.sort();
    out
}

fn load_bookmark_file(path: &Path) -> Result<Vec<(String, String)>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_chromium_bookmarks(&text)
}

fn parse_chromium_bookmarks(text: &str) -> Result<Vec<(String, String)>, String> {
    let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let Some(roots) = v.get("roots") else {
        return Ok(vec![]);
    };
    let mut acc = Vec::new();
    for key in ["bookmark_bar", "other", "synced"] {
        if let Some(n) = roots.get(key) {
            walk_bookmark_node(n, &mut acc);
        }
    }
    Ok(acc)
}

fn walk_bookmark_node(n: &Value, acc: &mut Vec<(String, String)>) {
    if let Some(t) = n.get("type").and_then(|x| x.as_str()) {
        if t == "url" {
            if let (Some(name), Some(url)) = (n.get("name").and_then(|x| x.as_str()), n.get("url").and_then(|x| x.as_str()))
            {
                if url.starts_with("http://")
                    || url.starts_with("https://")
                    || url.starts_with("ftp://")
                {
                    acc.push((name.to_string(), url.to_string()));
                }
            }
            return;
        }
    }
    if let Some(ch) = n.get("children").and_then(|c| c.as_array()) {
        for c in ch {
            walk_bookmark_node(c, acc);
        }
    }
}
