pub fn resolve_baidu_credentials(app_id: &str, secret: &str) -> (String, String) {
    (app_id.trim().to_string(), secret.trim().to_string())
}

pub fn resolve_baidu_ocr_credentials(api_key: &str, secret_key: &str) -> (String, String) {
    (
        api_key.trim().to_string(),
        secret_key.trim().to_string(),
    )
}
