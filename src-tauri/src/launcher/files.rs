//! 在配置的目录中按文件名子串搜索文件（不索引全磁盘）。

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use rayon::prelude::*;
use walkdir::WalkDir;

use super::LauncherItem as Item;

/// 单根目录上匹配过多时，整盘如 `D:\` 会优先在某一棵子树里耗尽；拆成多根并合并后按深度优先排序。
const MAX_FILE_RESULTS: usize = 100;
/// 单根目录内最多检查的路径项数（多根并行时各根独立，总体体验更快）。
const MAX_SCAN_PER_ROOT: u64 = 60_000;
const MIN_PER_ROOT: usize = 6;
const MAX_PER_ROOT: usize = 32;

/// 选择结果执行时打开文件本身，或打开其所在目录。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FileOpenMode {
    OpenFile,
    OpenParentDirectory,
}

/// 用于与 `get_app_icon_data_url` 联用：.exe、.lnk、.msc、macOS 的 .app 包等
pub fn icon_path_for_path(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }
    #[cfg(windows)]
    {
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext.eq_ignore_ascii_case("exe")
                    || ext.eq_ignore_ascii_case("lnk")
                    || ext.eq_ignore_ascii_case("msc")
                {
                    return Some(path.to_string_lossy().into_owned());
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.is_dir() {
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                return Some(path.to_string_lossy().into_owned());
            }
        } else if path.is_file() {
            return Some(path.to_string_lossy().into_owned());
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = path;
    }
    None
}

pub fn file_items_for_query(
    enabled: bool,
    roots_cfg: &[String],
    excluded_dir_names: &[String],
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
    let per_root_cap = ((MAX_FILE_RESULTS * 2) / n).clamp(MIN_PER_ROOT, MAX_PER_ROOT);
    // 多根并行时每根走独立步数预算，与串行时「整盘 80 万步」同量级
    let max_scan_per_root = (MAX_SCAN_PER_ROOT * 16 / n as u64).clamp(28_000, 120_000);

    let exclude_dirs: Arc<HashSet<String>> = Arc::new(
        excluded_dir_names
            .iter()
            .filter_map(|s| {
                let t = s.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_lowercase())
                }
            })
            .collect(),
    );

    // 多核并行各根，避免在 D:\Apps 等子树上顺序堵死
    let all_paths: Vec<PathBuf> = work_roots
        .par_iter()
        .flat_map(|wr| {
            walk_one_root(
                wr,
                &q_lower,
                per_root_cap,
                max_scan_per_root,
                Arc::clone(&exclude_dirs),
            )
        })
        .collect();

    // 去重：移入 HashSet 再倒出，避免 retain 时对每个 PathBuf 额外 clone
    let mut all_paths: Vec<PathBuf> = all_paths.into_iter().collect::<HashSet<_>>().into_iter().collect();
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

fn walk_one_root(
    root: &Path,
    q_lower: &str,
    max_matches: usize,
    max_scan_for_this_root: u64,
    exclude_dir_names: Arc<HashSet<String>>,
) -> Vec<PathBuf> {
    let mut matches = Vec::new();
    let mut local_scanned: u64 = 0;
    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            walk_entry_allowed(e, &exclude_dir_names)
        })
    {
        if local_scanned >= max_scan_for_this_root {
            break;
        }
        let Ok(entry) = entry else { continue };
        local_scanned += 1;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name();
        let name_match = if let Some(s) = name.to_str() {
            file_name_matches_query(s, q_lower)
        } else {
            let cow = name.to_string_lossy();
            file_name_matches_query(cow.as_ref(), q_lower)
        };
        if !name_match {
            continue;
        }
        matches.push(entry.path().to_path_buf());
        if matches.len() >= max_matches {
            break;
        }
    }
    matches
}

/// 是否进入/遍历该路径：`exclude_dir_names` **仅对目录**生效，避免与同名文件（如无扩展名 `dist`）冲突。
/// 深层以 `.` 开头且非 `.` 的目录/文件名一律跳过（如 `.env`、`.git`）。
///
/// **macOS**：不进入 `*.app` 包内（避免 `find`/`open` 搜出一堆 `Contents/Resources` 里的 svg/png）。
/// **Windows**：跳过 `WindowsApps`、`WinSxS`、Chromium 系 `Application\…\resources\`、Electron `resources\app\` 等应用内部资源路径。
fn walk_entry_allowed(
    e: &walkdir::DirEntry,
    exclude_dir_names: &HashSet<String>,
) -> bool {
    let name = e.file_name();
    let is_dir = e.file_type().is_dir();

    if is_dir {
        if let Some(s) = name.to_str() {
            #[cfg(target_os = "macos")]
            if s.ends_with(".app") {
                return false;
            }
            if s.eq_ignore_ascii_case("node_modules") {
                return false;
            }
        } else if name.to_string_lossy().eq_ignore_ascii_case("node_modules") {
            return false;
        }
    }

    #[cfg(windows)]
    if !platform_windows_allow_path_for_walk(&e.path()) {
        return false;
    }

    if is_dir {
        let excluded = if let Some(s) = name.to_str() {
            exclude_dir_names.contains(&s.to_lowercase())
        } else {
            exclude_dir_names.contains(&name.to_string_lossy().to_lowercase())
        };
        if excluded {
            return false;
        }
    }
    if e.depth() > 0 {
        let hidden_dot = if let Some(s) = name.to_str() {
            s.starts_with('.') && s != "."
        } else {
            let lossy = name.to_string_lossy();
            lossy.starts_with('.') && lossy != "."
        };
        if hidden_dot {
            return false;
        }
    }
    true
}

#[cfg(windows)]
fn platform_windows_allow_path_for_walk(path: &Path) -> bool {
    let pl = path.to_string_lossy().to_lowercase();
    if pl.contains("windowsapps") || pl.contains("\\winsxs\\") {
        return false;
    }
    // Chromium：...\Google\Chrome\Application\<ver>\...、Edge、Brave 等
    if pl.contains("\\application\\") && pl.contains("\\resources\\") {
        if pl.contains("\\google\\chrome\\")
            || pl.contains("\\microsoft\\edge\\")
            || pl.contains("\\bravesoftware\\brave-browser\\")
            || pl.contains("\\vivaldi\\application\\")
        {
            return false;
        }
    }
    // Electron / VS Code / Antigravity 等：...\resources\app\...
    if pl.contains("\\resources\\app\\") {
        return false;
    }
    true
}

/// 仅按**文件名**（非路径）子串匹配。查词已小写；纯 ASCII 文件名+关键词走无整串 `to_lowercase` 分配的快速路径。
fn file_name_matches_query(file_name: &str, q_lower: &str) -> bool {
    if q_lower.is_empty() {
        return true;
    }
    if !q_lower.is_ascii() {
        return file_name.to_lowercase().contains(q_lower);
    }
    if file_name.is_ascii() {
        return ascii_lowercase_contains(file_name.as_bytes(), q_lower.as_bytes());
    }
    file_name.to_lowercase().contains(q_lower)
}

/// `needle` 已为小写 ASCII；`hay` 为 ASCII 源串，按字节做大小写不敏感子串匹配。
fn ascii_lowercase_contains(hay: &[u8], needle: &[u8]) -> bool {
    if needle.is_empty() {
        return true;
    }
    if needle.len() > hay.len() {
        return false;
    }
    'outer: for i in 0..=(hay.len() - needle.len()) {
        for j in 0..needle.len() {
            let mut c = hay[i + j];
            if c.is_ascii_uppercase() {
                c = c.to_ascii_lowercase();
            }
            if c != needle[j] {
                continue 'outer;
            }
        }
        return true;
    }
    false
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
                icon_path: icon_path_for_path(path),
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
                icon_path: icon_path_for_path(path),
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
