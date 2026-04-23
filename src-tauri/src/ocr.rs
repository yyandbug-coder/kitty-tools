//! 百度侧调用的是「通用文字识别（标准版）」接口 `POST /rest/2.0/ocr/v1/general_basic`。
//! 官方文档：<https://cloud.baidu.com/doc/OCR/s/zk3h7xz52>
//! 注意：这与「iOCR 通用版」`iocr/recognise`（需 templateSign / classifierId，文档如 <https://cloud.baidu.com/doc/OCR/s/Ek3h7y961>）不是同一套 API，勿混用。

use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};

const BAIDU_OCR_GENERAL_BASIC_DOC: &str = "https://cloud.baidu.com/doc/OCR/s/zk3h7xz52";
const DEFAULT_BAIDU_AIP_BASE: &str = "https://aip.baidubce.com";
const DEFAULT_GOOGLE_VISION_ANNOTATE_URL: &str = "https://vision.googleapis.com/v1/images:annotate";

fn effective_baidu_ocr_aip_base(config_base: &str) -> String {
    let t = config_base.trim();
    if !t.is_empty() {
        return t.trim_end_matches('/').to_string();
    }
    DEFAULT_BAIDU_AIP_BASE.to_string()
}

fn resolve_google_vision_annotate_url(config_url: &str) -> String {
    let t = config_url.trim();
    if !t.is_empty() {
        return t.to_string();
    }
    DEFAULT_GOOGLE_VISION_ANNOTATE_URL.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f64,
}

async fn baidu_fetch_token(
    client: &Client,
    api_key: &str,
    secret_key: &str,
    aip_base: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/oauth/2.0/token?grant_type=client_credentials&client_id={}&client_secret={}",
        aip_base,
        urlencode_query(api_key),
        urlencode_query(secret_key)
    );
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("百度 OCR 获取令牌失败: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("百度 OCR 令牌解析失败: {}", e))?;

    if let Some(err) = body.get("error").and_then(|e| e.as_str()) {
        let desc = body
            .get("error_description")
            .and_then(|d| d.as_str())
            .unwrap_or("");
        return Err(format!(
            "百度 OCR 认证失败（{}）：{}。翻译开放平台 App ID/密钥不能用于智能云 OCR。请在控制台创建文字识别应用，填写 API Key 与 Secret Key，并开通「通用文字识别（标准版）」；文档见 {}（勿与 iOCR 固定模板接口混淆）。控制台：https://console.bce.baidu.com/ai/",
            err, desc, BAIDU_OCR_GENERAL_BASIC_DOC
        ));
    }

    body.get("access_token")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "百度 OCR 未返回 access_token".to_string())
}

async fn baidu_general_basic(
    client: &Client,
    access_token: &str,
    image_b64: &str,
    aip_base: &str,
) -> Result<String, String> {
    let url = format!(
        "{}/rest/2.0/ocr/v1/general_basic?access_token={}",
        aip_base,
        urlencode_query(access_token)
    );
    let response = client
        .post(url)
        .header(
            "Content-Type",
            "application/x-www-form-urlencoded",
        )
        .body(format!(
            "image={}&language_type=CHN_ENG",
            urlencode_form(image_b64)
        ))
        .send()
        .await
        .map_err(|e| format!("百度 OCR 请求失败: {}", e))?;

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("百度 OCR 响应解析失败: {}", e))?;

    if let Some(code) = body.get("error_code").filter(|c| !c.is_null()) {
        let code_str = code
            .as_i64()
            .map(|n| n.to_string())
            .or_else(|| code.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| code.to_string());
        let msg = body
            .get("error_msg")
            .and_then(|m| m.as_str())
            .unwrap_or("未知错误");
        return Err(format!("百度 OCR 错误 {}: {}", code_str, msg));
    }

    let text = body
        .get("words_result")
        .and_then(|w| w.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get("words").and_then(|x| x.as_str()))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    Ok(text)
}

async fn recognize_with_baidu(
    client: &Client,
    image_data: &[u8],
    ocr_api_key: &str,
    ocr_secret_key: &str,
    ocr_aip_base_cfg: &str,
) -> Result<OcrResult, String> {
    let (api_key, secret_key) =
        crate::baidu_creds::resolve_baidu_ocr_credentials(ocr_api_key, ocr_secret_key);
    if api_key.is_empty() || secret_key.is_empty() {
        return Err(format!(
            "截图识字使用百度「通用文字识别（标准版）」API（见 {}），需智能云应用的 API Key + Secret Key，与翻译开放平台密钥不同。请在设置中填写 OCR 两项。控制台：https://console.bce.baidu.com/ai/",
            BAIDU_OCR_GENERAL_BASIC_DOC
        ));
    }

    let aip_base = effective_baidu_ocr_aip_base(ocr_aip_base_cfg);
    let token = baidu_fetch_token(client, &api_key, &secret_key, &aip_base).await?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(image_data);
    let text = baidu_general_basic(client, &token, &b64, &aip_base).await?;

    Ok(OcrResult {
        text,
        confidence: 1.0,
    })
}

async fn recognize_with_google(
    client: &Client,
    image_data: &[u8],
    annotate_url_cfg: &str,
    api_key: &str,
) -> Result<OcrResult, String> {
    let b64 = base64::engine::general_purpose::STANDARD.encode(image_data);

    #[derive(Serialize)]
    struct VisionRequest {
        requests: Vec<VisionAnnotate>,
    }
    #[derive(Serialize)]
    struct VisionAnnotate {
        image: VisionImage,
        features: Vec<VisionFeature>,
    }
    #[derive(Serialize)]
    struct VisionImage {
        content: String,
    }
    #[derive(Serialize)]
    struct VisionFeature {
        #[serde(rename = "type")]
        feature_type: String,
    }

    let req = VisionRequest {
        requests: vec![VisionAnnotate {
            image: VisionImage { content: b64 },
            features: vec![VisionFeature {
                feature_type: "TEXT_DETECTION".to_string(),
            }],
        }],
    };

    let base = resolve_google_vision_annotate_url(annotate_url_cfg);
    let mut url = reqwest::Url::parse(&base)
        .map_err(|e| format!("Google Vision API 地址无效: {}", e))?;
    url.query_pairs_mut().append_pair("key", api_key);

    let response = client
        .post(url)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Google OCR 网络错误: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Google OCR API 错误: {}", response.status()));
    }

    #[derive(Deserialize)]
    struct VisionResponse {
        responses: Vec<AnnotateImageResponse>,
    }
    #[derive(Deserialize)]
    struct AnnotateImageResponse {
        text_annotations: Option<Vec<TextAnnotation>>,
    }
    #[derive(Deserialize)]
    struct TextAnnotation {
        description: String,
    }

    let data: VisionResponse = response
        .json()
        .await
        .map_err(|e| format!("Google OCR 解析失败: {}", e))?;

    let text = data
        .responses
        .into_iter()
        .next()
        .and_then(|r| r.text_annotations)
        .and_then(|annotations| annotations.into_iter().next())
        .map(|a| a.description)
        .unwrap_or_default();

    Ok(OcrResult {
        text,
        confidence: 1.0,
    })
}

fn resolve_google_vision_key(config_key: &str) -> String {
    config_key.trim().to_string()
}

fn baidu_ocr_ready(api_key: &str, secret_key: &str) -> bool {
    let (k, s) = crate::baidu_creds::resolve_baidu_ocr_credentials(api_key, secret_key);
    !k.is_empty() && !s.is_empty()
}

const OCR_NEED_VISION_HINT: &str = "截图识字需要云端 OCR：① 百度智能云「通用文字识别（标准版）」（文档见 https://cloud.baidu.com/doc/OCR/s/zk3h7xz52 ）；或 ② Google Cloud Vision；或 ③ 在设置中选择「有道翻译」并填写智云应用密钥。详见各厂商控制台。";

fn youdao_collect_text_from_result(result: &serde_json::Value) -> String {
    if let Some(s) = result.as_str() {
        return s.trim().to_string();
    }
    let mut line_strs: Vec<String> = Vec::new();
    youdao_append_lines_from_value(result, &mut line_strs);
    if line_strs.is_empty() {
        if let Some(regions) = result.get("regions").and_then(|x| x.as_array()) {
            for r in regions {
                youdao_append_lines_from_value(r, &mut line_strs);
            }
        }
    }
    line_strs.join("\n")
}

/// 相邻词均为 ASCII 字母数字时在中间加空格（如 `bob` 与 `2fcfa6c5`）；中文等单字词直接拼接为一行。
fn join_youdao_line_words(pieces: &[String]) -> String {
    if pieces.is_empty() {
        return String::new();
    }
    let mut out = pieces[0].clone();
    for i in 1..pieces.len() {
        let prev = pieces[i - 1].as_str();
        let cur = pieces[i].as_str();
        let p_last = prev.chars().last();
        let n_first = cur.chars().next();
        let space_between_ascii = matches!(
            (p_last, n_first),
            (Some(a), Some(b)) if a.is_ascii_alphanumeric() && b.is_ascii_alphanumeric()
        );
        if space_between_ascii {
            out.push(' ');
        }
        out.push_str(cur);
    }
    out
}

fn youdao_append_lines_from_value(v: &serde_json::Value, lines_out: &mut Vec<String>) {
    let Some(lines) = v.get("lines").and_then(|x| x.as_array()) else {
        return;
    };
    for line in lines {
        let mut pieces: Vec<String> = Vec::new();
        if let Some(words) = line.get("words").and_then(|x| x.as_array()) {
            for w in words {
                if let Some(word) = w.get("word").and_then(|x| x.as_str()) {
                    let t = word.trim();
                    if !t.is_empty() {
                        pieces.push(t.to_string());
                    }
                }
            }
        }
        if !pieces.is_empty() {
            lines_out.push(join_youdao_line_words(&pieces));
        }
    }
}

async fn recognize_with_youdao(
    client: &Client,
    image_data: &[u8],
    app_key_cfg: &str,
    secret_cfg: &str,
) -> Result<OcrResult, String> {
    let app_key = crate::youdao::resolve_youdao_app_key(app_key_cfg);
    let app_secret = crate::youdao::resolve_youdao_app_secret(secret_cfg);
    if app_key.is_empty() || app_secret.is_empty() {
        return Err(
            "请先在设置中填写有道智云应用 ID 与密钥，并绑定「通用文字识别」服务".to_string(),
        );
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(image_data);
    if b64.len() > 2_800_000 {
        return Err("截图编码后体积过大，有道通用 OCR 要求图像编码后小于约 2MB，请缩小选区".to_string());
    }

    let (salt, curtime, sign) = crate::youdao::sign_v3(&app_key, &app_secret, &b64);

    let params = [
        ("img", b64.as_str()),
        ("langType", "auto"),
        ("detectType", "10012"),
        ("imageType", "1"),
        ("appKey", app_key.as_str()),
        ("salt", salt.as_str()),
        ("sign", sign.as_str()),
        ("signType", "v3"),
        ("curtime", curtime.as_str()),
        ("docType", "json"),
    ];

    let response = client
        .post(crate::youdao::YOUDAO_OCR_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("有道 OCR 网络错误: {}", e))?;

    let raw = response
        .text()
        .await
        .map_err(|e| format!("有道 OCR 读取响应失败: {}", e))?;

    let body: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("有道 OCR 解析失败: {}", e))?;

    let code_v = body.get("errorCode");
    let ok = match code_v {
        Some(c) => {
            c.as_str() == Some("0") || c.as_i64() == Some(0) || c.as_u64() == Some(0)
        }
        None => false,
    };
    if !ok {
        let c = code_v
            .map(|x| {
                x.as_str()
                    .map(|s| s.to_string())
                    .or_else(|| x.as_i64().map(|n| n.to_string()))
                    .unwrap_or_else(|| x.to_string())
            })
            .unwrap_or_else(|| "未知".to_string());
        return Err(format!(
            "有道 OCR 错误 {}（请确认应用已绑定通用文字识别）。详见 https://ai.youdao.com/",
            c
        ));
    }

    let text = body
        .get("Result")
        .map(|r| youdao_collect_text_from_result(r))
        .unwrap_or_default();

    Ok(OcrResult {
        text,
        confidence: 1.0,
    })
}

/// 截图 / 图片识别：`translate_provider == "baidu"` 时仅走百度 OCR；`youdao` 走有道通用 OCR；否则**优先百度智能云 OCR**，再视情况使用 Google Vision。
pub async fn recognize_text(
    client: &Client,
    image_data: &[u8],
    translate_provider: &str,
    google_cloud_api_key: &str,
    google_vision_api_url: &str,
    baidu_ocr_api_key: &str,
    baidu_ocr_secret_key: &str,
    baidu_ocr_api_base_url: &str,
    youdao_app_key: &str,
    youdao_app_secret: &str,
) -> Result<OcrResult, String> {
    if translate_provider == "baidu" {
        return recognize_with_baidu(
            client,
            image_data,
            baidu_ocr_api_key,
            baidu_ocr_secret_key,
            baidu_ocr_api_base_url,
        )
        .await;
    }

    if translate_provider == "youdao" {
        return recognize_with_youdao(client, image_data, youdao_app_key, youdao_app_secret).await;
    }

    let google_key = resolve_google_vision_key(google_cloud_api_key);
    let baidu_ready = baidu_ocr_ready(baidu_ocr_api_key, baidu_ocr_secret_key);

    if baidu_ready {
        match recognize_with_baidu(
            client,
            image_data,
            baidu_ocr_api_key,
            baidu_ocr_secret_key,
            baidu_ocr_api_base_url,
        )
        .await
        {
            Ok(r) if !r.text.is_empty() => return Ok(r),
            Ok(_) => {
                if google_key.is_empty() {
                    return Err(
                        "截图中未识别到文字（百度 OCR 无结果）。可填写 Google Cloud Vision 后重试，或调整选区。"
                            .to_string(),
                    );
                }
                match recognize_with_google(client, image_data, google_vision_api_url, &google_key)
                    .await
                {
                    Ok(r) if !r.text.is_empty() => return Ok(r),
                    Ok(_) => {
                        return Err(
                            "截图中未识别到文字（百度与 Google 均无结果）。请调整截图区域后重试。"
                                .to_string(),
                        );
                    }
                    Err(e) => {
                        return Err(format!(
                            "百度 OCR 无有效文字，且 Google Vision 失败：{}",
                            e
                        ));
                    }
                }
            }
            Err(baidu_err) => {
                if google_key.is_empty() {
                    return Err(baidu_err);
                }
                match recognize_with_google(client, image_data, google_vision_api_url, &google_key)
                    .await
                {
                    Ok(r) if !r.text.is_empty() => return Ok(r),
                    Ok(_) => {
                        return Err(format!(
                            "百度 OCR 失败（{}）；Google Vision 也未识别到文字。",
                            baidu_err
                        ));
                    }
                    Err(g_err) => {
                        return Err(format!(
                            "百度 OCR：{}；Google Vision：{}。请检查密钥、网络与选区。",
                            baidu_err, g_err
                        ));
                    }
                }
            }
        }
    }

    if !google_key.is_empty() {
        match recognize_with_google(client, image_data, google_vision_api_url, &google_key).await {
            Ok(r) if !r.text.is_empty() => return Ok(r),
            Ok(_) => {
                return Err(
                    "截图中未识别到文字（Google Vision 无结果）。可在设置中填写百度智能云「通用文字识别」作为兜底，或调整选区。"
                        .to_string(),
                );
            }
            Err(e) => {
                return Err(format!(
                    "Google Vision 识图失败：{}。也可在设置中填写百度智能云「通用文字识别」。",
                    e
                ));
            }
        }
    }

    Err(OCR_NEED_VISION_HINT.to_string())
}

fn urlencode_query(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}

fn urlencode_form(s: &str) -> String {
    let mut result = String::new();
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            b' ' => result.push_str("%20"),
            _ => {
                result.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    result
}
