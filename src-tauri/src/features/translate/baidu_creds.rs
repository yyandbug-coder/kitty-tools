/// 百度翻译开放平台与智能云 OCR 的凭证（仅使用设置中填写的值，不从环境变量注入）。
pub fn resolve_baidu_credentials(app_id: &str, secret: &str) -> (String, String) {
    (app_id.trim().to_string(), secret.trim().to_string())
}

/// 百度智能云 OCR（OAuth client_credentials）：须为控制台里的 **API Key**与 **Secret Key**，与翻译开放平台 App ID/密钥不是同一套。
pub fn resolve_baidu_ocr_credentials(api_key: &str, secret_key: &str) -> (String, String) {
    (
        api_key.trim().to_string(),
        secret_key.trim().to_string(),
    )
}
