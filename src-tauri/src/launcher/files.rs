//! 在配置的目录中按文件名子串搜索文件（不索引全磁盘）。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::LauncherItem as Item;

/// 单根目录上匹配过多时，整盘如 `D:\` 会优先在某一棵子树里耗尽；拆成多根并合并后按深度优先排序。
const MAX_FILE_RESULTS: usize = 100;
const MAX_GLOBAL_SCAN: u64 = 800_000;
const MIN_PER_ROOT: usize = 6;
const MAX_PER_ROOT: usize = 32;

/// 选择结果执行时打开文件本身，或打开其所在目录。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FileOpenMode {
    OpenFile,
    OpenParentDirectory,
}

pub fn file_items_for_query(
    enabled: bool,
    roots_cfg: &[String],
    query: &str,
    mode: FileOpenMode,
) -> Vec<Item> {
    if !enabled {
        return vec![];
    }
    let q = query.trim();
    if q.len() < 2 {
        return vec![];
    }
    let q_lower = q.to_lowercase();

    let raw_roots: Vec<PathBuf> = if roots_cfg.is_empty() {
        dirs::document_dir().into_iter().collect()
    } else {
        roots_cfg
            .iter()
            .filter_map(|s| {
                let p = normalize_config_path(s.trim());
                if p.is_dir() {
                    Some(p)
                } else {
                    None
                }
            })
            .collect()
    };
    if raw_roots.is_empty() {
        return vec![];
    }

    let work_roots = expand_work_roots(raw_roots);
    let n = work_roots.len().max(1);
    let per_root_cap = ((MAX_FILE_RESULTS * 2) / n)
        .max(MIN_PER_ROOT)
        .min(MAX_PER_ROOT);
    let max_scan_per_root = (MAX_GLOBAL_SCAN / n as u64).max(50_000);

    let mut global_scanned: u64 = 0;
    let mut all_paths: Vec<PathBuf> = Vec::new();

    for wr in work_roots {
        let (paths, _) = walk_one_root(
            &wr,
            &q_lower,
            per_root_cap,
            max_scan_per_root,
            &mut global_scanned,
        );
        all_paths.extend(paths);
        if global_scanned >= MAX_GLOBAL_SCAN {
            break;
        }
    }

    // 去重
    let mut seen = HashSet::new();
    all_paths.retain(|p| seen.insert(p.to_string_lossy().to_string()));
    // 较浅路径优先，避免深层目录里无关命中挤掉用户目录
    all_paths.sort_by_key(|p| p.components().count());
    all_paths.truncate(MAX_FILE_RESULTS);

    all_paths
        .into_iter()
        .map(|path| make_item(&path, mode))
        .collect()
}

fn normalize_config_path(s: &str) -> PathBuf {
    if s.is_empty() {
        return PathBuf::new();
    }
    #[cfg(windows)]
    {
        let t = s.trim();
        let b = t.as_bytes();
        if b.len() == 2 && b[1] == b':' {
            if t.chars().next().is_some_and(|c| c.is_ascii_alphabetic()) {
                return PathBuf::from(format!("{}\\", &t[..2].to_uppercase()));
            }
        }
    }
    Path::new(s.trim()).to_path_buf()
}

/// Windows 下若根目录为整盘如 `D:\`，拆成其下一层子目录分别搜索，避免在某一子树下耗尽名额。
fn expand_work_roots(roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for root in roots {
        #[cfg(windows)]
        {
            if is_windows_drive_root(&root) {
                if let Ok(rd) = std::fs::read_dir(&root) {
                    let mut subs: Vec<PathBuf> = rd
                        .filter_map(|e| e.ok())
                        .map(|e| e.path())
                        .filter(|p| p.is_dir())
                        .collect();
                    subs.sort();
                    if subs.is_empty() {
                        out.push(root);
                    } else {
                        out.extend(subs);
                    }
                    continue;
                }
            }
        }
        out.push(root);
    }
    out
}

#[cfg(windows)]
fn is_windows_drive_root(p: &Path) -> bool {
    use std::path::Component;
    let mut c = p.components();
    match (c.next(), c.next(), c.next()) {
        (Some(Component::Prefix(_)), Some(Component::RootDir), None) => true,
        _ => false,
    }
}

#[cfg(not(windows))]
fn is_windows_drive_root(_: &Path) -> bool {
    false
}

fn walk_one_root(
    root: &Path,
    q_lower: &str,
    max_matches: usize,
    max_scan_for_this_root: u64,
    global_scanned: &mut u64,
) -> (Vec<PathBuf>, u64) {
    let mut matches = Vec::new();
    let mut local_scanned: u64 = 0;
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            let n = e.file_name().to_string_lossy();
            n != "node_modules"
                && n != ".git"
                && !n.eq_ignore_ascii_case("target")
                && !(e.depth() > 0 && n.starts_with('.') && n != ".")
        })
    {
        if local_scanned >= max_scan_for_this_root || *global_scanned >= MAX_GLOBAL_SCAN {
            break;
        }
        let Ok(entry) = entry else { continue };
        local_scanned += 1;
        *global_scanned += 1;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if !name.to_lowercase().contains(q_lower) {
            continue;
        }
        matches.push(entry.path().to_path_buf());
        if matches.len() >= max_matches {
            break;
        }
    }
    (matches, local_scanned)
}

fn make_item(path: &Path, mode: FileOpenMode) -> Item {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    match mode {
        FileOpenMode::OpenFile => {
            let parent = path
                .parent()
                .and_then(|p| p.to_str())
                .unwrap_or(".");
            Item {
                id: file_item_id("f", path, mode),
                title: name,
                subtitle: format!("文件 · {parent}"),
                kind: "open_path".into(),
                payload: path.to_string_lossy().to_string(),
            }
        }
        FileOpenMode::OpenParentDirectory => {
            let parent_path = path.parent().map(Path::to_path_buf).unwrap_or_else(|| path.to_path_buf());
            let payload = parent_path.to_string_lossy().to_string();
            let paren_str = parent_path.to_string_lossy();
            Item {
                id: file_item_id("d", path, mode),
                title: name,
                subtitle: format!("打开所在目录 · {paren_str}"),
                kind: "open_path".into(),
                payload,
            }
        }
    }
}

fn file_item_id(suffix: &str, file_path: &Path, mode: FileOpenMode) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    suffix.hash(&mut h);
    mode.hash(&mut h);
    file_path.to_string_lossy().hash(&mut h);
    format!("file{suffix}-{:x}", h.finish())
}
