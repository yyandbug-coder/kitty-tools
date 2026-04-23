use rand::Rng;
use sha2::{Digest, Sha256};

pub const YOUDAO_TRANSLATE_URL: &str = "https://openapi.youdao.com/api";
pub const YOUDAO_OCR_URL: &str = "https://openapi.youdao.com/ocrapi";

pub fn truncate_for_sign(q: &str) -> String {
    let chars: Vec<char> = q.chars().collect();
    let size = chars.len();
    if size <= 20 {
        return q.to_string();
    }
    let head: String = chars.iter().take(10).collect();
    let tail: String = chars.iter().skip(size.saturating_sub(10)).collect();
    format!("{}{}{}", head, size, tail)
}

pub fn sign_v3(app_key: &str, app_secret: &str, sign_body: &str) -> (String, String, String) {
    let input = truncate_for_sign(sign_body);
    let salt: String = (0..8)
        .map(|_| format!("{:02x}", rand::thread_rng().gen::<u8>()))
        .collect();
    let curtime = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string();
    let sign_src = format!("{}{}{}{}{}", app_key, input, salt, curtime, app_secret);
    let mut hasher = Sha256::new();
    hasher.update(sign_src.as_bytes());
    let sign = format!("{:x}", hasher.finalize());
    (salt, curtime, sign)
}

pub fn resolve_youdao_app_key(config: &str) -> String {
    config.trim().to_string()
}

pub fn resolve_youdao_app_secret(config: &str) -> String {
    config.trim().to_string()
}
