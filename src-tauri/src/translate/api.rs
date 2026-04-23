use rand::Rng;
use reqwest::multipart;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslateRequest {
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResult {
    pub source_text: String,
    pub translated_text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub provider: String,
}

/// 各厂商翻译凭证（来自设置；在异步任务中可整体 clone）。
#[derive(Debug, Clone)]
pub struct TranslateCreds {
    pub baidu_app_id: String,
    pub baidu_secret: String,
    pub google_translate_api_url: String,
    /// 与 Cloud Vision 共用同一 GCP API Key
    pub google_cloud_api_key: String,
    pub openai_api_base_url: String,
    pub openai_api_key: String,
    pub openai_model: String,
    pub youdao_app_key: String,
    pub youdao_app_secret: String,
}

impl TranslateCreds {
    pub fn from_config(cfg: &crate::config::AppConfig) -> Self {
        Self {
            baidu_app_id: cfg.baidu.app_id.clone(),
            baidu_secret: cfg.baidu.secret.clone(),
            google_translate_api_url: cfg.google.translate_api_url.clone(),
            google_cloud_api_key: cfg.google.api_key.clone(),
            openai_api_base_url: cfg.openai.api_base_url.clone(),
            openai_api_key: cfg.openai.api_key.clone(),
            openai_model: cfg.openai.model.clone(),
            youdao_app_key: cfg.youdao.app_key.clone(),
            youdao_app_secret: cfg.youdao.app_secret.clone(),
        }
    }
}

pub async fn translate(
    client: &Client,
    request: &TranslateRequest,
    provider: &str,
    creds: &TranslateCreds,
) -> Result<TranslateResult, String> {
    match provider {
        "baidu" => baidu_translate(client, request, &creds.baidu_app_id, &creds.baidu_secret).await,
        "google" => google_translate(client, request, creds).await,
        "openai" => openai_translate(client, request, creds).await,
        "youdao" => youdao_translate(client, request, creds).await,
        _ => Err(format!("Unknown translate provider: {}", provider)),
    }
}

fn map_lang_to_baidu(code: &str) -> &'static str {
    match code {
        "auto" => "auto",
        "zh-CN" => "zh",
        "zh-TW" => "cht",
        "en" => "en",
        "ja" => "jp",
        "ko" => "kor",
        "fr" => "fra",
        "de" => "de",
        "es" => "spa",
        "ru" => "ru",
        "pt" => "pt",
        "it" => "it",
        _ => "auto",
    }
}

/// 用户选「自动检测」时：本地 Lingua 有把握则先固定为应用内语言代码，否则仍为 `auto`。
fn effective_source_lang(request: &TranslateRequest) -> String {
    if request.source_lang != "auto" {
        return request.source_lang.clone();
    }
    crate::lang_detect::detect_source_for_auto(&request.text)
        .map(|s| s.to_string())
        .unwrap_or_else(|| "auto".to_string())
}

/// 与前端 `SUPPORTED_LANGUAGES` / 各引擎返回值对齐的规范代码。
fn canonicalize_app_lang(code: &str) -> String {
    let t = code.trim();
    match t {
        "zh" | "zh-CN" | "ZH" | "ZH-HANS" | "zh-Hans" => "zh-CN".to_string(),
        "cht" | "zh-TW" | "ZH-HANT" | "zh-Hant" => "zh-TW".to_string(),
        "jp" | "ja" | "JA" => "ja".to_string(),
        "kor" | "ko" | "KO" => "ko".to_string(),
        "fra" | "fr" | "FR" => "fr".to_string(),
        "spa" | "es" | "ES" => "es".to_string(),
        "en" | "EN" => "en".to_string(),
        "de" | "ger" | "DE" => "de".to_string(),
        "ru" | "RU" => "ru".to_string(),
        "pt" | "PT" => "pt".to_string(),
        "it" | "IT" => "it".to_string(),
        "auto" => "auto".to_string(),
        _ => {
            let u = t.to_uppercase();
            match u.as_str() {
                "ZH" | "ZH-CN" | "ZH-HANS" => "zh-CN".to_string(),
                "ZH-TW" | "ZH-HANT" | "CHT" => "zh-TW".to_string(),
                _ => t.to_string(),
            }
        }
    }
}

fn lang_family_key(canonical: &str) -> &str {
    match canonical {
        "zh-CN" | "zh-TW" => "zh",
        other => other,
    }
}

fn lang_slots_match(detected_canon: &str, slot_canon: &str) -> bool {
    lang_family_key(detected_canon) == lang_family_key(slot_canon)
}

/// 开启双向互译且源语言为 `auto` 时：根据本地 Lingua 结果在两种语言间选定 `source_lang` / `target_lang`。
/// 识别不确定或与甲、乙均不匹配时，保持原请求（仍由在线引擎处理 `auto`）。
pub fn resolve_translate_request(
    request: &TranslateRequest,
    cfg: &crate::config::AppConfig,
) -> TranslateRequest {
    if !cfg.bidirectional_auto || request.source_lang != "auto" {
        return request.clone();
    }
    let a = canonicalize_app_lang(&cfg.bidirectional_lang_a);
    let b = canonicalize_app_lang(&cfg.bidirectional_lang_b);
    if a == "auto" || b == "auto" || a == b {
        return request.clone();
    }
    let eff = effective_source_lang(request);
    if eff == "auto" {
        return request.clone();
    }
    let eff_c = canonicalize_app_lang(&eff);
    let source_lang = eff_c.clone();
    if lang_slots_match(&eff_c, &a) {
        TranslateRequest {
            text: request.text.clone(),
            source_lang,
            target_lang: b,
        }
    } else if lang_slots_match(&eff_c, &b) {
        TranslateRequest {
            text: request.text.clone(),
            source_lang,
            target_lang: a,
        }
    } else {
        request.clone()
    }
}

const DEFAULT_GOOGLE_TRANSLATE_URL: &str =
    "https://translation.googleapis.com/language/translate/v2";
const DEFAULT_OPENAI_BASE: &str = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL: &str = "gpt-4o-mini";

fn effective_google_translate_url(url: &str) -> String {
    let t = url.trim();
    if t.is_empty() {
        DEFAULT_GOOGLE_TRANSLATE_URL.to_string()
    } else {
        t.to_string()
    }
}

/// Translation 与 Vision 共用：仅使用设置中的 `google_cloud_api_key`。
fn resolve_google_api_key(config_key: &str) -> String {
    config_key.trim().to_string()
}

fn map_lang_to_google_translate_v2(code: &str) -> String {
    match code {
        "auto" => "auto".to_string(),
        "zh-CN" => "zh-CN".to_string(),
        "zh-TW" => "zh-TW".to_string(),
        "en" => "en".to_string(),
        "ja" => "ja".to_string(),
        "ko" => "ko".to_string(),
        "fr" => "fr".to_string(),
        "de" => "de".to_string(),
        "es" => "es".to_string(),
        "ru" => "ru".to_string(),
        "pt" => "pt".to_string(),
        "it" => "it".to_string(),
        _ => code.to_string(),
    }
}

fn normalize_google_detected_source(code: &str) -> String {
    match code {
        "zh" | "zh-CN" => "zh-CN".to_string(),
        "zh-TW" | "zh-Hant" | "cht" => "zh-TW".to_string(),
        "jp" | "ja" => "ja".to_string(),
        "kor" | "ko" => "ko".to_string(),
        "fra" | "fr" => "fr".to_string(),
        "spa" | "es" => "es".to_string(),
        other => other.to_string(),
    }
}

fn effective_openai_base(url: &str) -> String {
    let t = url.trim();
    if t.is_empty() {
        DEFAULT_OPENAI_BASE.to_string()
    } else {
        t.trim_end_matches('/').to_string()
    }
}

fn resolve_openai_api_key(config_key: &str) -> String {
    config_key.trim().to_string()
}

fn effective_openai_model(model: &str) -> String {
    let t = model.trim();
    if t.is_empty() {
        DEFAULT_OPENAI_MODEL.to_string()
    } else {
        t.to_string()
    }
}

async fn baidu_translate(
    client: &Client,
    request: &TranslateRequest,
    app_id: &str,
    secret: &str,
) -> Result<TranslateResult, String> {
    let (app_id, secret) = crate::baidu_creds::resolve_baidu_credentials(app_id, secret);
    if app_id.is_empty() || secret.is_empty() {
        return Err("请先在设置中填写百度翻译 App ID 与密钥".to_string());
    }

    if request.text.len() > 6000 {
        return Err("百度翻译单次最多 6000 字符，请缩短文本".to_string());
    }

    let effective_sl = effective_source_lang(request);
    let from = map_lang_to_baidu(&effective_sl);
    let to = map_lang_to_baidu(&request.target_lang);
    let salt = rand::thread_rng().gen::<u32>().to_string();
    let sign_src = format!("{}{}{}{}", app_id, request.text, salt, secret);
    let sign = format!("{:x}", md5::compute(sign_src.as_bytes()));

    let params = [
        ("q", request.text.as_str()),
        ("from", from),
        ("to", to),
        ("appid", app_id.as_str()),
        ("salt", salt.as_str()),
        ("sign", sign.as_str()),
    ];

    let response = client
        .post("https://api.fanyi.baidu.com/api/trans/vip/translate")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if let Some(code_v) = body.get("error_code").filter(|c| !c.is_null()) {
        let code = code_v
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| code_v.as_i64().map(|n| n.to_string()))
            .unwrap_or_else(|| code_v.to_string());
        let msg = body
            .get("error_msg")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("百度翻译错误 {}: {}", code, msg));
    }

    let translated_text = body["trans_result"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("dst").and_then(|d| d.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    let detected = body["from"]
        .as_str()
        .unwrap_or(from)
        .to_string();

    let source_lang_out = if request.source_lang != "auto" {
        request.source_lang.clone()
    } else if effective_sl != "auto" {
        effective_sl
    } else {
        detected
    };

    Ok(TranslateResult {
        source_text: request.text.clone(),
        translated_text,
        source_lang: source_lang_out,
        target_lang: request.target_lang.clone(),
        provider: "百度翻译".to_string(),
    })
}

fn baidu_json_error_code_display(v: &serde_json::Value) -> String {
    v.as_str()
        .map(|s| s.to_string())
        .or_else(|| v.as_i64().map(|n| n.to_string()))
        .or_else(|| v.as_u64().map(|n| n.to_string()))
        .unwrap_or_else(|| v.to_string())
}

/// 图片翻译接口（fanyi-api）常见错误的操作提示；52003 多为账号/应用未授权，不一定是「仅未开通图片翻译」。
fn baidu_picture_api_error_hint(code: &str, msg: &str) -> &'static str {
    match code {
        "52003" => {
            "。请核对：① App ID与密钥来自「百度翻译开放平台」(fanyi-api.baidu.com)，勿使用智能云 OCR 的 API Key/Secret Key；② 控制台已对该应用开通「图片翻译」并完成开发者认证；③ 主界面文本翻译若也失败，多半是 App ID 或密钥填错。"
        }
        "54001" | "54003" | "54004" => {
            "。多为签名或参数错误，请确认密钥为开放平台「密钥」、与文本翻译为同一套。"
        }
        "54005" => "。请降低调用频率或稍后再试。",
        "58000" | "58001" | "58002" | "58003" => "。账户或套餐余额/额度异常，请在开放平台控制台检查计费与额度。",
        _ => {
            if msg.contains("UNAUTHORIZED") {
                "。若文本翻译正常，多为未开通图片翻译或 App 无该接口权限；否则请核对开放平台凭证是否配对。"
            } else {
                ""
            }
        }
    }
}

/// 截图翻译（百度）：走翻译开放平台「图片翻译」接口，与通用文本翻译共用 App ID / 密钥（签名用）。
/// 文档：<https://fanyi-api.baidu.com/product/22>
pub async fn baidu_translate_screenshot_image(
    client: &Client,
    image_data: &[u8],
    source_lang: &str,
    target_lang: &str,
    app_id: &str,
    secret: &str,
) -> Result<TranslateResult, String> {
    let (app_id, secret) = crate::baidu_creds::resolve_baidu_credentials(app_id, secret);
    if app_id.is_empty() || secret.is_empty() {
        return Err("请先在设置中填写百度翻译 App ID 与密钥".to_string());
    }

    if image_data.len() > 4 * 1024 * 1024 {
        return Err("截图超过 4MB，百度图片翻译无法处理".to_string());
    }

    let from = map_lang_to_baidu(source_lang);
    let to = map_lang_to_baidu(target_lang);
    let img_md5 = format!("{:x}", md5::compute(image_data));
    let salt = rand::thread_rng().gen::<u32>().to_string();
    // 与开放平台文档一致：cuid 固定为 APICUID；mac 为占位字面量
    let cuid = "APICUID";
    let mac = "mac";
    let sign_src = format!("{}{}{}{}{}{}", app_id, img_md5, salt, cuid, mac, secret);
    let sign = format!("{:x}", md5::compute(sign_src.as_bytes()));

    let image_part = multipart::Part::bytes(image_data.to_vec())
        .file_name("screenshot.png")
        .mime_str("image/png")
        .map_err(|e| format!("构建图片表单失败: {}", e))?;

    let form = multipart::Form::new()
        .text("from", from.to_string())
        .text("to", to.to_string())
        .text("appid", app_id.clone())
        .text("salt", salt)
        .text("sign", sign)
        .text("cuid", cuid.to_string())
        .text("mac", mac.to_string())
        .text("version", "3")
        .text("paste", "0")
        .part("image", image_part);

    let response = client
        .post("https://fanyi-api.baidu.com/api/trans/sdk/picture")
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("百度图片翻译网络错误: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("百度图片翻译解析失败: {}", e))?;

    let success = body
        .get("error_code")
        .map(|c| c.as_str() == Some("0") || c.as_i64() == Some(0))
        .unwrap_or(false);

    if !success {
        let code = body
            .get("error_code")
            .map(baidu_json_error_code_display)
            .unwrap_or_default();
        let msg = body
            .get("error_msg")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        let hint = baidu_picture_api_error_hint(&code, msg);
        return Err(format!("百度图片翻译错误 {}: {}{}", code, msg, hint));
    }

    let data = body
        .get("data")
        .ok_or_else(|| "百度图片翻译未返回 data".to_string())?;

    let sum_src = data
        .get("sumSrc")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let sum_dst = data
        .get("sumDst")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let from_detected = data
        .get("from")
        .and_then(|s| s.as_str())
        .unwrap_or(from)
        .to_string();
    let to_used = data
        .get("to")
        .and_then(|s| s.as_str())
        .unwrap_or(to)
        .to_string();

    Ok(TranslateResult {
        source_text: sum_src,
        translated_text: sum_dst,
        source_lang: from_detected,
        target_lang: to_used,
        provider: "百度翻译".to_string(),
    })
}

/// Google Cloud Translation API v2（需在控制台启用并创建 API 密钥）。
async fn google_translate(
    client: &Client,
    request: &TranslateRequest,
    creds: &TranslateCreds,
) -> Result<TranslateResult, String> {
    let base_url = effective_google_translate_url(&creds.google_translate_api_url);
    let api_key = resolve_google_api_key(&creds.google_cloud_api_key);
    if api_key.is_empty() {
        return Err(
            "请先在设置中填写 Google Cloud API 密钥（翻译与截图识字 Vision 共用同一密钥）"
                .to_string(),
        );
    }

    let mut url = reqwest::Url::parse(&base_url)
        .map_err(|e| format!("谷歌翻译 API 地址无效: {}", e))?;
    url.query_pairs_mut().append_pair("key", &api_key);

    let effective_sl = effective_source_lang(request);
    let target = map_lang_to_google_translate_v2(&request.target_lang);

    #[derive(Serialize)]
    struct GoogleV2Body {
        q: String,
        target: String,
        format: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        source: Option<String>,
    }

    let body = GoogleV2Body {
        q: request.text.clone(),
        target,
        format: "text".to_string(),
        source: if effective_sl != "auto" {
            Some(map_lang_to_google_translate_v2(&effective_sl))
        } else {
            None
        },
    };

    let response = client
        .post(url)
        .header("Content-Type", "application/json; charset=utf-8")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("谷歌翻译网络错误: {}", e))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|e| format!("谷歌翻译读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(msg) = v.pointer("/error/message").and_then(|m| m.as_str()) {
                return Err(format!("谷歌翻译 API 错误: {}", msg));
            }
        }
        return Err(format!("谷歌翻译 API 错误: HTTP {}", status));
    }

    #[derive(Deserialize)]
    struct GoogleV2Response {
        data: GoogleV2Data,
    }
    #[derive(Deserialize)]
    struct GoogleV2Data {
        translations: Vec<GoogleV2Translation>,
    }
    #[derive(Deserialize)]
    struct GoogleV2Translation {
        #[serde(rename = "translatedText")]
        translated_text: String,
        #[serde(rename = "detectedSourceLanguage")]
        detected_source_language: Option<String>,
    }

    let parsed: GoogleV2Response =
        serde_json::from_str(&raw).map_err(|e| format!("谷歌翻译解析失败: {}", e))?;

    let first = parsed
        .data
        .translations
        .into_iter()
        .next()
        .ok_or_else(|| "谷歌翻译未返回译文".to_string())?;

    let detected = first
        .detected_source_language
        .map(|s| normalize_google_detected_source(&s))
        .unwrap_or_default();

    let source_lang_out = if request.source_lang != "auto" {
        request.source_lang.clone()
    } else if effective_sl != "auto" {
        effective_sl
    } else if !detected.is_empty() {
        detected
    } else {
        "auto".to_string()
    };

    Ok(TranslateResult {
        source_text: request.text.clone(),
        translated_text: first.translated_text,
        source_lang: source_lang_out,
        target_lang: request.target_lang.clone(),
        provider: "Google".to_string(),
    })
}

async fn openai_translate(
    client: &Client,
    request: &TranslateRequest,
    creds: &TranslateCreds,
) -> Result<TranslateResult, String> {
    let api_key = resolve_openai_api_key(&creds.openai_api_key);
    if api_key.is_empty() {
        return Err(
            "请先在设置中填写 OpenAI API 密钥".to_string(),
        );
    }

    let effective_sl = effective_source_lang(request);
    let result_source_lang = if request.source_lang != "auto" {
        request.source_lang.clone()
    } else if effective_sl != "auto" {
        effective_sl.clone()
    } else {
        "auto".to_string()
    };

    let prompt = if request.source_lang == "auto" && effective_sl == "auto" {
        format!(
            "Translate the following text into locale {}. Output only the translated text, no quotes or explanations.\n\n{}",
            request.target_lang, request.text
        )
    } else {
        let from = if request.source_lang != "auto" {
            request.source_lang.clone()
        } else {
            effective_sl.clone()
        };
        format!(
            "Translate from {} to {}. Output only the translated text.\n\n{}",
            from, request.target_lang, request.text
        )
    };

    let base = effective_openai_base(&creds.openai_api_base_url);
    let url = format!("{}/chat/completions", base);
    let model = effective_openai_model(&creds.openai_model);

    #[derive(Serialize)]
    struct ChatRequest {
        model: String,
        messages: Vec<ChatMessage>,
        max_tokens: u32,
    }
    #[derive(Serialize)]
    struct ChatMessage {
        role: String,
        content: String,
    }

    let chat_req = ChatRequest {
        model,
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens: 4096,
    };

    let response = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&chat_req)
        .send()
        .await
        .map_err(|e| format!("OpenAI 网络错误: {}", e))?;

    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|e| format!("OpenAI 读取响应失败: {}", e))?;

    if !status.is_success() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(msg) = v.pointer("/error/message").and_then(|m| m.as_str()) {
                return Err(format!("OpenAI API 错误: {}", msg));
            }
        }
        return Err(format!("OpenAI API 错误: HTTP {}", status));
    }

    #[derive(Deserialize)]
    struct ChatResponse {
        choices: Vec<ChatChoice>,
    }
    #[derive(Deserialize)]
    struct ChatChoice {
        message: ChatMessageResponse,
    }
    #[derive(Deserialize)]
    struct ChatMessageResponse {
        content: String,
    }

    let data: ChatResponse =
        serde_json::from_str(&raw).map_err(|e| format!("OpenAI 解析失败: {}", e))?;

    let translated_text = data
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .unwrap_or_default();

    Ok(TranslateResult {
        source_text: request.text.clone(),
        translated_text,
        source_lang: result_source_lang,
        target_lang: request.target_lang.clone(),
        provider: "OpenAI".to_string(),
    })
}

fn map_lang_to_youdao(code: &str) -> &'static str {
    match code {
        "auto" => "auto",
        "zh-CN" => "zh-CHS",
        "zh-TW" => "zh-CHT",
        "en" => "en",
        "ja" => "ja",
        "ko" => "ko",
        "fr" => "fr",
        "de" => "de",
        "es" => "es",
        "ru" => "ru",
        "pt" => "pt",
        "it" => "it",
        _ => "auto",
    }
}

fn youdao_api_error_code_str(v: &serde_json::Value) -> String {
    v.as_str()
        .map(|s| s.to_string())
        .or_else(|| v.as_i64().map(|n| n.to_string()))
        .unwrap_or_else(|| v.to_string())
}

async fn youdao_translate(
    client: &Client,
    request: &TranslateRequest,
    creds: &TranslateCreds,
) -> Result<TranslateResult, String> {
    let app_key = crate::youdao::resolve_youdao_app_key(&creds.youdao_app_key);
    let app_secret = crate::youdao::resolve_youdao_app_secret(&creds.youdao_app_secret);
    if app_key.is_empty() || app_secret.is_empty() {
        return Err(
            "请先在设置中填写有道智云应用 ID 与应用密钥"
                .to_string(),
        );
    }

    if request.text.len() > 5000 {
        return Err("有道翻译单次文本建议不超过 5000 字符，请缩短后重试".to_string());
    }

    let effective_sl = effective_source_lang(request);
    let from = if request.source_lang != "auto" {
        map_lang_to_youdao(&request.source_lang)
    } else if effective_sl != "auto" {
        map_lang_to_youdao(&effective_sl)
    } else {
        "auto"
    };
    let to = map_lang_to_youdao(&request.target_lang);

    let (salt, curtime, sign) =
        crate::youdao::sign_v3(&app_key, &app_secret, request.text.as_str());

    let params = [
        ("q", request.text.as_str()),
        ("from", from),
        ("to", to),
        ("appKey", app_key.as_str()),
        ("salt", salt.as_str()),
        ("sign", sign.as_str()),
        ("signType", "v3"),
        ("curtime", curtime.as_str()),
    ];

    let response = client
        .post(crate::youdao::YOUDAO_TRANSLATE_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("有道翻译网络错误: {}", e))?;

    let raw = response
        .text()
        .await
        .map_err(|e| format!("有道翻译读取响应失败: {}", e))?;

    let body: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("有道翻译解析失败: {}", e))?;

    let code_v = body.get("errorCode");
    let ok = match code_v {
        Some(c) => {
            c.as_str() == Some("0") || c.as_i64() == Some(0) || c.as_u64() == Some(0)
        }
        None => false,
    };
    if !ok {
        let c = code_v
            .map(youdao_api_error_code_str)
            .unwrap_or_else(|| "未知".to_string());
        return Err(format!(
            "有道翻译错误 {}（请确认应用已绑定「文本翻译」服务，密钥与签名正确）。详见 https://ai.youdao.com/",
            c
        ));
    }

    let translated_text =
        if let Some(arr) = body.get("translation").and_then(|t| t.as_array()) {
            arr.iter()
                .filter_map(|item| item.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        } else if let Some(s) = body.get("translation").and_then(|t| t.as_str()) {
            s.to_string()
        } else {
            String::new()
        };

    if translated_text.is_empty() {
        return Err("有道翻译未返回译文".to_string());
    }

    let source_lang_out = if request.source_lang != "auto" {
        request.source_lang.clone()
    } else if effective_sl != "auto" {
        effective_sl
    } else {
        "auto".to_string()
    };

    Ok(TranslateResult {
        source_text: request.text.clone(),
        translated_text,
        source_lang: source_lang_out,
        target_lang: request.target_lang.clone(),
        provider: "有道翻译".to_string(),
    })
}
