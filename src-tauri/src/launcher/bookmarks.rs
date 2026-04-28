//! 从 Chromium 系浏览器的 `Bookmarks` JSON 读取书签（按设置项启用）。

use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use serde_json::Value;

use super::recency;
use super::LauncherItem;

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

    let mut seen = HashSet::new();
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

    let mut out = Vec::new();
    for (title, url, src) in flat.into_iter() {
        if !seen.insert(url.clone()) {
            continue;
        }
        let title_l = title.to_lowercase();
        if !title_l.contains(&q_lower) && !url.to_lowercase().contains(&q_lower) {
            continue;
        }
        let mut h = std::collections::hash_map::DefaultHasher::new();
        url.hash(&mut h);
        let id = format!("bm-{src}-{:x}", h.finish());
        out.push(LauncherItem {
            id,
            title,
            subtitle: format!("书签 · {src}"),
            kind: "open_url".into(),
            payload: url,
            icon_path: None,
        });
    }
    out.sort_by(|a, b| {
        let ta = recency::url_last_opened_ms(&a.payload);
        let tb = recency::url_last_opened_ms(&b.payload);
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
