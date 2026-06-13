pub mod history_db;
pub mod limits;
pub mod source;
pub mod app_icon;
pub mod image_cache;
pub mod paste;
pub mod watcher;

#[cfg(target_os = "macos")]
pub mod mac_access;

#[cfg(target_os = "windows")]
pub mod win_access;

pub use watcher::ClipboardEvent;
