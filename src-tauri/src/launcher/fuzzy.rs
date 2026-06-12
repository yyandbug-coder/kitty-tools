//! 启动器模糊匹配（基于 [`nucleo_matcher`]，Helix / lazygit 同款匹配核）。
//!
//! 用法：每次查询调用一次 [`compile_atom`] 把用户输入编译成 `Atom`；随后对各候选
//! 调 [`score`] 取分数，0 视为不命中。`Atom::parse` 已支持 `^foo`、`!foo`、`'foo`、
//! `foo$` 等过滤语法，对启动器使用是直接的增益（用户可以输 `^vs` 强制前缀匹配）。
//!
//! `nucleo_matcher::Matcher` 内部预分配 ~135KB 的工作内存；为避免每次按键反复
//! 申请释放，这里把 `Matcher` 与 `Vec<char>` 字符缓冲都放在 `thread_local`。

use std::cell::RefCell;

use nucleo_matcher::pattern::{Atom, CaseMatching, Normalization};
use nucleo_matcher::{Config, Matcher, Utf32Str};

thread_local! {
    /// 线程局部 matcher：避免每次评分都重新 `Matcher::new`（约 135KB 分配）。
    static MATCHER: RefCell<Matcher> = RefCell::new(Matcher::new(Config::DEFAULT));
    /// `Utf32Str::new` 需要一个外置 `Vec<char>` 作为承载缓冲；线程局部复用。
    static CHAR_BUF: RefCell<Vec<char>> = const { RefCell::new(Vec::new()) };
}

/// 把用户查询编译成 `Atom`。空字符串返回 `None`。
///
/// `CaseMatching::Smart`：纯小写查询忽略大小写，含大写时严格匹配。
/// `Normalization::Smart`：纯 ASCII 查询不做 Unicode 归一化，否则按规范比较。
pub(crate) fn compile_atom(query: &str) -> Option<Atom> {
    let q = query.trim();
    if q.is_empty() {
        return None;
    }
    Some(Atom::parse(q, CaseMatching::Smart, Normalization::Smart))
}

/// 廉价子序列预筛：`text_lower` 须为预计算小写串；query 各字符按序出现则视为可能命中。
/// 用于数千候选在 nucleo 全量评分前先缩圈。
pub(crate) fn might_match_subsequence(query: &str, text_lower: &str) -> bool {
    let q = query.trim();
    if q.is_empty() || text_lower.is_empty() {
        return false;
    }
    let mut text_chars = text_lower.chars();
    'outer: for qc in q.chars().flat_map(|c| c.to_lowercase()) {
        for tc in text_chars.by_ref() {
            if tc == qc {
                continue 'outer;
            }
        }
        return false;
    }
    true
}

/// 对 `text` 用线程局部 matcher 评分；不命中返回 `None`。
pub(crate) fn score(atom: &Atom, text: &str) -> Option<u16> {
    if text.is_empty() {
        return None;
    }
    MATCHER.with(|m| {
        CHAR_BUF.with(|cb| {
            let mut matcher = m.borrow_mut();
            let mut buf = cb.borrow_mut();
            buf.clear();
            let utf32 = Utf32Str::new(text, &mut buf);
            atom.score(utf32, &mut matcher)
        })
    })
}
