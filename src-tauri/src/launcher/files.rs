//! 在配置的目录中按文件名子串搜索文件（不索引全磁盘）。

use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use super::LauncherItem;

const MAX_FILE_RESULTS: usize = 40;
const MAX_ENTRIES_SCANNED: u64 = 100_000;

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
) -> Vec<LauncherItem> {
    if !enabled {
        return vec![];
    }
    let q = query.trim();
    if q.len() < 2 {
        return vec![];
    }
    let q_lower = q.to_lowercase();

    let roots: Vec<PathBuf> = if roots_cfg.is_empty() {
        dirs::document_dir().into_iter().collect()
    } else {
        roots_cfg
            .iter()
            .filter_map(|s| {
                let p = Path::new(s.trim());
                if p.is_dir() {
                    Some(p.to_path_buf())
                } else {
                    None
                }
            })
            .collect()
    };
    if roots.is_empty() {
        return vec![];
    }

    let mut out = Vec::new();
    let mut scanned: u64 = 0;

    'outer: for root in roots {
        for entry in WalkDir::new(&root)
            .max_depth(20)
            .into_iter()
            .filter_entry(|e| {
                let n = e.file_name().to_string_lossy();
                n != "node_modules"
                    && n != ".git"
                    && !n.eq_ignore_ascii_case("target")
                    && !(e.depth() > 0 && n.starts_with('.') && n != ".")
            })
        {
            if scanned >= MAX_ENTRIES_SCANNED {
                break 'outer;
            }
            let Ok(entry) = entry else { continue };
            scanned += 1;
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy();
            if !name.to_lowercase().contains(&q_lower) {
                continue;
            }
            let path = entry.path().to_path_buf();
            if mode == FileOpenMode::OpenFile {
                let parent = path
                    .parent()
                    .and_then(|p| p.to_str())
                    .unwrap_or(".");
                out.push(LauncherItem {
                    id: file_item_id("f", &path, mode),
                    title: name.to_string(),
                    subtitle: format!("文件 · {parent}"),
                    kind: "open_path".into(),
                    payload: path.to_string_lossy().to_string(),
                });
            } else {
                // 打开所在目录
                let parent_path = path.parent().map(Path::to_path_buf).unwrap_or(path.clone());
                let payload = parent_path.to_string_lossy().to_string();
                let paren_str = parent_path.to_string_lossy();
                out.push(LauncherItem {
                    id: file_item_id("d", &path, mode),
                    title: name.to_string(),
                    subtitle: format!("打开所在目录 · {paren_str}"),
                    kind: "open_path".into(),
                    payload,
                });
            }
            if out.len() >= MAX_FILE_RESULTS {
                break 'outer;
            }
        }
    }
    out
}

fn file_item_id(suffix: &str, file_path: &Path, mode: FileOpenMode) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    suffix.hash(&mut h);
    mode.hash(&mut h);
    file_path.to_string_lossy().hash(&mut h);
    format!("file{suffix}-{:x}", h.finish())
}
