//! 从 Chromium 系浏览器的 `Bookmarks` JSON 读取书签（按设置项启用）。
//!
//! 书签文件可能很大；原先每次按键都整文件读取 + JSON 解析 + 对每条书签重复 `to_lowercase`，
//! 且排序时对每条结果反复加锁读 recency，会导致启动器明显卡顿。此处对「展开后的书签行」做
//! 磁盘 mtime 签名缓存，并预计算小写字段。

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde_json::Value;

use super::recency;
use super::LauncherItem;

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
    let sig = bookmark_sources_signature(chrome, edge, brave);
    if let Ok(g) = FLAT_CACHE.read() {
        if let Some(c) = g.as_ref() {
            if c.sig == sig {
                return Arc::clone(&c.rows);
            }
        }
    }
    let rows = Arc::new(load_all_flat_rows(chrome, edge, brave));
    if let Ok(mut g) = FLAT_CACHE.write() {
        if let Some(c) = g.as_ref() {
            if c.sig == sig {
                return Arc::clone(&c.rows);
            }
        }
        *g = Some(BookmarkFlatCache {
            sig,
            rows: Arc::clone(&rows),
        });
    }
    rows
}

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
    let recency = recency::url_recency_snapshot();

    let mut out = Vec::new();
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
    }
    out.sort_by(|a, b| {
        let ka = recency::normalize_url_key(&a.payload);
        let kb = recency::normalize_url_key(&b.payload);
        let ta = recency.get(&ka).copied().unwrap_or(0);
        let tb = recency.get(&kb).copied().unwrap_or(0);
        tb.cmp(&ta).then_with(|| a.title.cmp(&b.title))
    });
    out.truncate(50);
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
