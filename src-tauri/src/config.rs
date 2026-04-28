use serde::{Deserialize, Serialize};

fn default_bidirectional_lang_a() -> String {
    "zh-CN".to_string()
}

fn default_bidirectional_lang_b() -> String {
    "en".to_string()
}

fn default_clipboard_shortcut() -> String {
    "CommandOrControl+Shift+V".to_string()
}

fn default_launcher_shortcut() -> String {
    "Alt+Space".to_string()
}

fn default_app_theme_preset() -> String {
    "default".to_string()
}

/// 百度：翻译开放平台 + 智能云 OCR（截图识字）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct BaiduConfig {
    /// 翻译开放平台 App ID
    pub app_id: String,
    /// 翻译开放平台密钥
    pub secret: String,
    /// 智能云文字识别 API Key
    pub ocr_api_key: String,
    /// 智能云文字识别 Secret Key
    pub ocr_secret_key: String,
    /// OCR 所用 AIP 根地址；空则内置默认
    pub ocr_aip_base_url: String,
}

/// Google：文本 Translation v2 + Vision OCR共用 `api_key`，各服务请求地址分字段存放。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct GoogleConfig {
    pub api_key: String,
    pub vision_api_url: String,
    pub translate_api_url: String,
}

/// OpenAI 兼容接口。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct OpenaiConfig {
    pub api_base_url: String,
    pub api_key: String,
    pub model: String,
}

/// 有道智云（文本翻译 + 通用 OCR）。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct YoudaoConfig {
    pub app_key: String,
    pub app_secret: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppConfig {
    // ── Translate fields ───────────────────────────────────────────
    pub source_lang: String,
    pub target_lang: String,
    pub translate_provider: String,
    pub baidu: BaiduConfig,
    pub google: GoogleConfig,
    pub openai: OpenaiConfig,
    pub youdao: YoudaoConfig,
    pub hotkey_selection: String,
    pub hotkey_screenshot: String,
    /// 登录系统后是否自动启动应用（托盘驻留）。
    pub launch_on_startup: bool,
    pub auto_copy: bool,
    pub theme: String,
    pub floating_pinned: bool,
    pub floating_window_x: Option<i32>,
    pub floating_window_y: Option<i32>,
    /// 首次安装为 true：启动时自动打开设置；用户在设置中完成引导后改为 false。
    pub first_run: bool,
    /// 为真且请求中含 `auto` 时，才按本地识别在 `bidirectional_lang_a` 与 `bidirectional_lang_b` 间选向；为假则不作甲/乙解析。
    pub bidirectional_auto: bool,
    /// 互译语言甲（应用内代码，如 zh-CN）
    #[serde(default = "default_bidirectional_lang_a")]
    pub bidirectional_lang_a: String,
    /// 互译语言乙（如 en）
    #[serde(default = "default_bidirectional_lang_b")]
    pub bidirectional_lang_b: String,

    // ── Clipboard fields ───────────────────────────────────────────
    /// 剪贴板历史全局快捷键。
    #[serde(default = "default_clipboard_shortcut")]
    pub clipboard_shortcut: String,
    /// 失焦时自动隐藏剪贴板历史窗口。
    #[serde(default = "default_true")]
    pub clipboard_hide_on_unfocus: bool,
    /// 剪贴板历史最大条目数。
    #[serde(default = "default_clipboard_history_max")]
    pub clipboard_history_max: u32,
    /// 剪贴板历史保留天数。
    #[serde(default = "default_clipboard_history_retention_days")]
    pub clipboard_history_retention_days: u32,
    /// 是否显示剪贴板条目预览。
    #[serde(default = "default_true")]
    pub clipboard_show_preview: bool,
    /// 按回车是否自动粘贴。
    #[serde(default = "default_true")]
    pub clipboard_paste_on_enter: bool,
    /// 是否禁止文本选中（macOS 风格）。
    #[serde(default = "default_true")]
    pub clipboard_disable_text_selection: bool,
    /// 主题预设名称："default" | "ocean" | "forest" | "sunset" | "custom"。
    #[serde(default = "default_app_theme_preset")]
    pub app_theme_preset: String,
    /// 自定义主题色相值（仅 app_theme_preset == "custom" 时生效）。
    #[serde(default)]
    pub custom_hue: u16,

    // ── Launcher (command palette) ─────────────────────────────────
    /// 启动器（命令面板）全局快捷键；空字符串表示不注册快捷键。
    #[serde(default = "default_launcher_shortcut")]
    pub launcher_shortcut: String,
    /// 失焦时自动隐藏启动器；为 false 时表示「固定」，失焦不关闭直至 Esc 或快捷键。
    #[serde(default = "default_true")]
    pub launcher_hide_on_unfocus: bool,
    /// 启动器：是否包含 Google Chrome 书签（Chromium `Bookmarks`）。
    #[serde(default)]
    pub launcher_bookmarks_chrome: bool,
    /// 启动器：是否包含 Microsoft Edge 书签。
    #[serde(default)]
    pub launcher_bookmarks_edge: bool,
    /// 启动器：是否包含 Brave 书签。
    #[serde(default)]
    pub launcher_bookmarks_brave: bool,
    /// 启动器：是否按文件名搜索本地文件（见 `launcher_file_search_paths`）。
    #[serde(default = "default_launcher_file_search_enabled")]
    pub launcher_file_search_enabled: bool,
    /// 文件搜索根目录；空则使用系统「文档」目录。
    #[serde(default)]
    pub launcher_file_search_paths: Vec<String>,
    /// 遍历时若某级目录名与此列表**忽略大小写**相同则跳过其整棵子树（如 `node_modules`、`dist`）。
    #[serde(default = "default_launcher_file_search_excluded_dir_names")]
    pub launcher_file_search_excluded_dir_names: Vec<String>,
    /// 启动器窗口上次内宽（px）；未设置时用默认 680。
    #[serde(default)]
    pub launcher_window_width: Option<u32>,
    /// 启动器窗口上次内高（px）；未设置时用默认 480。
    #[serde(default)]
    pub launcher_window_height: Option<u32>,
}

fn default_true() -> bool {
    true
}

fn default_clipboard_history_max() -> u32 {
    100
}

fn default_clipboard_history_retention_days() -> u32 {
    7
}

fn default_launcher_file_search_enabled() -> bool {
    true
}

fn default_launcher_file_search_excluded_dir_names() -> Vec<String> {
    vec![
        "node_modules".to_string(),
        "dist".to_string(),
        "target".to_string(),
        ".git".to_string(),
        "build".to_string(),
        "bower_components".to_string(),
    ]
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            source_lang: "auto".to_string(),
            target_lang: default_bidirectional_lang_a(),
            translate_provider: "youdao".to_string(),
            baidu: BaiduConfig::default(),
            google: GoogleConfig {
                api_key: String::new(),
                vision_api_url: "https://vision.googleapis.com/v1/images:annotate".to_string(),
                translate_api_url: "https://translation.googleapis.com/language/translate/v2"
                    .to_string(),
            },
            openai: OpenaiConfig {
                api_base_url: "https://api.openai.com/v1".to_string(),
                api_key: String::new(),
                model: "gpt-4o-mini".to_string(),
            },
            youdao: YoudaoConfig::default(),
            hotkey_selection: "CmdOrCtrl+Shift+T".to_string(),
            hotkey_screenshot: "CmdOrCtrl+Shift+S".to_string(),
            launch_on_startup: false,
            auto_copy: true,
            theme: "system".to_string(),
            floating_pinned: false,
            floating_window_x: None,
            floating_window_y: None,
            first_run: true,
            bidirectional_auto: true,
            bidirectional_lang_a: "zh-CN".to_string(),
            bidirectional_lang_b: "en".to_string(),

            clipboard_shortcut: "CommandOrControl+Shift+V".to_string(),
            clipboard_hide_on_unfocus: true,
            clipboard_history_max: 100,
            clipboard_history_retention_days: 7,
            clipboard_show_preview: true,
            clipboard_paste_on_enter: true,
            clipboard_disable_text_selection: true,
            app_theme_preset: "default".to_string(),
            custom_hue: 0,
            launcher_shortcut: default_launcher_shortcut(),
            launcher_hide_on_unfocus: true,
            launcher_bookmarks_chrome: false,
            launcher_bookmarks_edge: false,
            launcher_bookmarks_brave: false,
            launcher_file_search_enabled: true,
            launcher_file_search_paths: Vec::new(),
            launcher_file_search_excluded_dir_names: default_launcher_file_search_excluded_dir_names(),
            launcher_window_width: None,
            launcher_window_height: None,
        }
    }
}

/// SQLite 中曾存扁平字段的旧版 JSON，启动时迁入嵌套结构。
#[derive(Debug, Deserialize)]
#[serde(default)]
struct AppConfigLegacy {
    source_lang: String,
    target_lang: String,
    translate_provider: String,
    baidu_app_id: String,
    baidu_secret: String,
    baidu_ocr_api_key: String,
    baidu_ocr_secret_key: String,
    baidu_ocr_api_base_url: String,
    google_vision_api_url: String,
    google_cloud_api_key: String,
    google_translate_api_url: String,
    openai_api_base_url: String,
    openai_api_key: String,
    openai_model: String,
    youdao_app_key: String,
    youdao_app_secret: String,
    hotkey_selection: String,
    hotkey_screenshot: String,
    #[serde(default)]
    launch_on_startup: bool,
    auto_copy: bool,
    theme: String,
    floating_pinned: bool,
    floating_window_x: Option<i32>,
    floating_window_y: Option<i32>,
    first_run: bool,
    bidirectional_auto: bool,
    #[serde(default = "default_bidirectional_lang_a")]
    bidirectional_lang_a: String,
    #[serde(default = "default_bidirectional_lang_b")]
    bidirectional_lang_b: String,
}

impl Default for AppConfigLegacy {
    fn default() -> Self {
        Self {
            source_lang: "auto".to_string(),
            target_lang: default_bidirectional_lang_a(),
            translate_provider: "youdao".to_string(),
            baidu_app_id: String::new(),
            baidu_secret: String::new(),
            baidu_ocr_api_key: String::new(),
            baidu_ocr_secret_key: String::new(),
            baidu_ocr_api_base_url: String::new(),
            google_vision_api_url: String::new(),
            google_cloud_api_key: String::new(),
            google_translate_api_url: String::new(),
            openai_api_base_url: "https://api.openai.com/v1".to_string(),
            openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".to_string(),
            youdao_app_key: String::new(),
            youdao_app_secret: String::new(),
            hotkey_selection: "CmdOrCtrl+Shift+T".to_string(),
            hotkey_screenshot: "CmdOrCtrl+Shift+S".to_string(),
            launch_on_startup: false,
            auto_copy: true,
            theme: "system".to_string(),
            floating_pinned: false,
            floating_window_x: None,
            floating_window_y: None,
            first_run: true,
            bidirectional_auto: true,
            bidirectional_lang_a: default_bidirectional_lang_a(),
            bidirectional_lang_b: default_bidirectional_lang_b(),
        }
    }
}

impl From<AppConfigLegacy> for AppConfig {
    fn from(l: AppConfigLegacy) -> Self {
        Self {
            source_lang: l.source_lang,
            target_lang: l.target_lang,
            translate_provider: l.translate_provider,
            baidu: BaiduConfig {
                app_id: l.baidu_app_id,
                secret: l.baidu_secret,
                ocr_api_key: l.baidu_ocr_api_key,
                ocr_secret_key: l.baidu_ocr_secret_key,
                ocr_aip_base_url: l.baidu_ocr_api_base_url,
            },
            google: GoogleConfig {
                api_key: l.google_cloud_api_key,
                vision_api_url: l.google_vision_api_url,
                translate_api_url: l.google_translate_api_url,
            },
            openai: OpenaiConfig {
                api_base_url: l.openai_api_base_url,
                api_key: l.openai_api_key,
                model: l.openai_model,
            },
            youdao: YoudaoConfig {
                app_key: l.youdao_app_key,
                app_secret: l.youdao_app_secret,
            },
            hotkey_selection: l.hotkey_selection,
            hotkey_screenshot: l.hotkey_screenshot,
            launch_on_startup: l.launch_on_startup,
            auto_copy: l.auto_copy,
            theme: l.theme,
            floating_pinned: l.floating_pinned,
            floating_window_x: l.floating_window_x,
            floating_window_y: l.floating_window_y,
            first_run: l.first_run,
            bidirectional_auto: l.bidirectional_auto,
            bidirectional_lang_a: l.bidirectional_lang_a,
            bidirectional_lang_b: l.bidirectional_lang_b,

            // Clipboard fields use defaults for legacy migration
            ..AppConfig::default()
        }
    }
}

/// 将 JSON Value 中所有 Object 的 key 从 snake_case 转为 camelCase（递归）。
fn json_keys_to_camel_case(v: serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Object(map) => {
            let new_map: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .map(|(k, v)| (snake_to_camel(&k), json_keys_to_camel_case(v)))
                .collect();
            serde_json::Value::Object(new_map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(json_keys_to_camel_case).collect())
        }
        other => other,
    }
}

fn snake_to_camel(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut upper = false;
    for c in s.chars() {
        if c == '_' {
            upper = true;
        } else if upper {
            result.push(c.to_ascii_uppercase());
            upper = false;
        } else {
            result.push(c);
        }
    }
    result
}

/// 从 SQLite `payload` 解析：新结构含 `baidu` 等对象；旧结构为扁平字段时自动迁移。
/// 旧版嵌套数据（snake_case 键）会被自动转换为 camelCase 后再解析。
pub fn parse_stored_config_json(json: &str) -> Result<AppConfig, String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("配置 JSON 无效: {}", e))?;
    let has_nested = v
        .get("baidu")
        .and_then(|b| b.as_object())
        .is_some();
    if has_nested {
        // 检查是否已是 camelCase（含 camelCase 特征键）还是旧 snake_case
        let is_camel = v.get("sourceLang").is_some()
            || v.get("clipboardHideOnUnfocus").is_some()
            || v.get("appThemePreset").is_some()
            || v.get("hotkeySelection").is_some();
        let data = if is_camel { v } else { json_keys_to_camel_case(v) };
        serde_json::from_value(data).map_err(|e| format!("配置数据损坏: {}", e))
    } else {
        let legacy: AppConfigLegacy =
            serde_json::from_value(v).map_err(|e| format!("配置数据损坏: {}", e))?;
        Ok(AppConfig::from(legacy))
    }
}

pub fn load_config() -> AppConfig {
    let mut config = match crate::config_sqlite::load_from_sqlite() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("加载本地配置失败（SQLite）：{}，已使用默认配置", e);
            AppConfig::default()
        }
    };
    normalize_builtin_google_api_urls(&mut config);

    let mut needs_persist = false;
    if config.translate_provider == "deepl" {
        eprintln!("翻译引擎 DeepL 已不再支持，已自动切换为 youdao");
        config.translate_provider = "youdao".to_string();
        needs_persist = true;
    }
    // 设置里「目标语言」下拉排除了 auto；历史默认 target_lang=auto 会导致界面空白
    if config.target_lang == "auto" || config.target_lang.trim().is_empty() {
        config.target_lang = default_bidirectional_lang_a();
        needs_persist = true;
    }

    if needs_persist {
        match save_config(&config) {
            Ok(saved) => config = saved,
            Err(e) => eprintln!(
                "[kitty-tools] 配置已修正（翻译引擎或目标语言），但写入失败: {}",
                e
            ),
        }
    }

    config
}

/// Translation v2 与 Vision `images:annotate` 使用官方固定地址。
fn normalize_builtin_google_api_urls(config: &mut AppConfig) {
    config.google.translate_api_url =
        "https://translation.googleapis.com/language/translate/v2".to_string();
    config.google.vision_api_url =
        "https://vision.googleapis.com/v1/images:annotate".to_string();
}

/// 写入前强制使用内置的 Google 官方接口地址，并持久化到 SQLite，返回与库内一致的配置（供更新内存态）。
pub fn save_config(config: &AppConfig) -> Result<AppConfig, String> {
    let mut c = config.clone();
    normalize_builtin_google_api_urls(&mut c);
    crate::config_sqlite::save_to_sqlite(&c)?;
    Ok(c)
}
