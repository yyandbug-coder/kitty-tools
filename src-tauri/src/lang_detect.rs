//! 本地语种推断（Lingua）：在「自动检测」且文本特征足够时先锁定源语言，再调用各在线引擎，
//! 减轻短句、中日韩混排等场景下仅依赖接口 `auto` 的误判。

use lingua::{Language, LanguageDetector, LanguageDetectorBuilder};
use std::sync::OnceLock;

fn app_detector() -> &'static LanguageDetector {
    static DETECTOR: OnceLock<LanguageDetector> = OnceLock::new();
    DETECTOR.get_or_init(|| {
        LanguageDetectorBuilder::from_languages(&[
            Language::Chinese,
            Language::English,
            Language::French,
            Language::German,
            Language::Italian,
            Language::Japanese,
            Language::Korean,
            Language::Portuguese,
            Language::Russian,
            Language::Spanish,
        ])
        .build()
    })
}

fn lingua_to_app_code(lang: Language) -> &'static str {
    match lang {
        Language::English => "en",
        Language::Chinese => "zh-CN",
        Language::Japanese => "ja",
        Language::Korean => "ko",
        Language::French => "fr",
        Language::German => "de",
        Language::Spanish => "es",
        Language::Russian => "ru",
        Language::Portuguese => "pt",
        Language::Italian => "it",
    }
}

fn is_cjk_or_kana_or_hangul(c: char) -> bool {
    matches!(
        c as u32,
        0x3040..=0x30FF | 0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xAC00..=0xD7AF
    )
}

fn should_run_lingua(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    let n = t.chars().count();
    if n < 2 {
        return false;
    }
    if t.chars().any(is_cjk_or_kana_or_hangul) {
        true
    } else {
        n >= 10
    }
}

pub fn detect_source_for_auto(text: &str) -> Option<&'static str> {
    if !should_run_lingua(text) {
        return None;
    }
    app_detector()
        .detect_language_of(text.trim())
        .map(lingua_to_app_code)
        .filter(|&code| code != "auto")
}
