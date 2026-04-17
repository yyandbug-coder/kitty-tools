export interface Language {
  code: string
  name: string
  nativeName: string
}

export interface TranslateResult {
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  provider: string
}

export interface TranslateRequest {
  text: string
  sourceLang: string
  targetLang: string
}

export interface OcrResult {
  text: string
  confidence: number
  regions?: OcrRegion[]
}

export interface OcrRegion {
  bounds: { x: number; y: number; width: number; height: number }
  text: string
  confidence: number
}

/** 百度：翻译开放平台 + 智能云 OCR。 */
export interface BaiduProviderConfig {
  appId: string
  secret: string
  ocrApiKey: string
  ocrSecretKey: string
  ocrAipBaseUrl: string
}

/** Google：同一 API Key；Vision / Translation 官方地址由应用内置并在保存时写死。 */
export interface GoogleProviderConfig {
  apiKey: string
  visionApiUrl: string
  translateApiUrl: string
}

export interface OpenaiProviderConfig {
  apiBaseUrl: string
  apiKey: string
  model: string
}

export interface YoudaoProviderConfig {
  appKey: string
  appSecret: string
}

export interface AppConfig {
  sourceLang: string
  targetLang: string
  translateProvider: TranslateProvider
  baidu: BaiduProviderConfig
  google: GoogleProviderConfig
  openai: OpenaiProviderConfig
  youdao: YoudaoProviderConfig
  hotkeySelection: string
  hotkeyScreenshot: string
  /** 登录系统后自动启动（托盘驻留） */
  launchOnStartup: boolean
  autoCopy: boolean
  theme: 'light' | 'dark' | 'system'
  floatingPinned: boolean
  floatingWindowX: number | null
  floatingWindowY: number | null
  /** 首次安装为 true；在设置中完成引导后应为 false */
  firstRun: boolean
  /**
   * 源语言为「自动检测」且本地能识别语种时，在互译语言甲/乙之间自动选择翻译方向（如中文→英文、英文→中文）。
   */
  bidirectionalAuto: boolean
  /** 互译语言甲（应用内 code，勿用 auto） */
  bidirectionalLangA: string
  /** 互译语言乙 */
  bidirectionalLangB: string
}

export type TranslateProvider = 'baidu' | 'google' | 'youdao' | 'openai'

/** 界面展示用中文名称（下拉框等） */
export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'auto', name: '自动检测', nativeName: '自动检测' },
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'zh-TW', name: '繁体中文', nativeName: '\u7e41\u9ad4\u4e2d\u6587' },
  { code: 'en', name: '英语', nativeName: 'English' },
  { code: 'ja', name: '日语', nativeName: '日本語' },
  { code: 'ko', name: '韩语', nativeName: '한국어' },
  { code: 'fr', name: '法语', nativeName: 'Français' },
  { code: 'de', name: '德语', nativeName: 'Deutsch' },
  { code: 'es', name: '西班牙语', nativeName: 'Español' },
  { code: 'ru', name: '俄语', nativeName: 'Русский' },
  { code: 'pt', name: '葡萄牙语', nativeName: 'Português' },
  { code: 'it', name: '意大利语', nativeName: 'Italiano' },
]

/** 各引擎返回的检测语言代码与界面 `code` 对齐（如百度用 zh、jp） */
const LANG_CODE_ALIASES: Record<string, string> = {
  zh: 'zh-CN',
  cht: 'zh-TW',
  jp: 'ja',
  kor: 'ko',
  fra: 'fr',
  spa: 'es',
  ZH: 'zh-CN',
  'ZH-HANS': 'zh-CN',
  'ZH-HANT': 'zh-TW',
  EN: 'en',
  JA: 'ja',
  KO: 'ko',
  FR: 'fr',
  DE: 'de',
  ES: 'es',
  RU: 'ru',
  PT: 'pt',
  IT: 'it',
}

export function getLanguageDisplayName(code: string): string {
  const normalized =
    LANG_CODE_ALIASES[code] ?? LANG_CODE_ALIASES[code.toUpperCase()] ?? code
  return SUPPORTED_LANGUAGES.find((l) => l.code === normalized)?.name ?? code
}

const PROVIDER_LABELS: Record<TranslateProvider, string> = {
  baidu: '百度翻译',
  google: '谷歌翻译',
  youdao: '有道翻译',
  openai: 'OpenAI',
}

export function getProviderDisplayName(provider: string): string {
  return PROVIDER_LABELS[provider as TranslateProvider] ?? provider
}

export const DEFAULT_CONFIG: AppConfig = {
  sourceLang: 'auto',
  targetLang: 'en',
  translateProvider: 'youdao',
  baidu: {
    appId: '',
    secret: '',
    ocrApiKey: '',
    ocrSecretKey: '',
    ocrAipBaseUrl: '',
  },
  google: {
    apiKey: '',
    visionApiUrl: 'https://vision.googleapis.com/v1/images:annotate',
    translateApiUrl: 'https://translation.googleapis.com/language/translate/v2',
  },
  openai: {
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  },
  youdao: {
    appKey: '',
    appSecret: '',
  },
  hotkeySelection: 'CmdOrCtrl+Shift+T',
  hotkeyScreenshot: 'CmdOrCtrl+Shift+S',
  launchOnStartup: false,
  autoCopy: true,
  theme: 'system',
  floatingPinned: false,
  floatingWindowX: null,
  floatingWindowY: null,
  firstRun: false,
  bidirectionalAuto: false,
  bidirectionalLangA: 'zh-CN',
  bidirectionalLangB: 'en',
}

/** 与后端 `AppConfig` 一致，供 `invoke` 传参（snake_case，厂商为嵌套对象）。 */
export function appConfigToRust(cfg: AppConfig) {
  return {
    source_lang: cfg.sourceLang,
    target_lang: cfg.targetLang,
    translate_provider: cfg.translateProvider,
    baidu: {
      app_id: cfg.baidu.appId,
      secret: cfg.baidu.secret,
      ocr_api_key: cfg.baidu.ocrApiKey,
      ocr_secret_key: cfg.baidu.ocrSecretKey,
      ocr_aip_base_url: cfg.baidu.ocrAipBaseUrl,
    },
    google: {
      api_key: cfg.google.apiKey,
      vision_api_url: cfg.google.visionApiUrl,
      translate_api_url: cfg.google.translateApiUrl,
    },
    openai: {
      api_base_url: cfg.openai.apiBaseUrl,
      api_key: cfg.openai.apiKey,
      model: cfg.openai.model,
    },
    youdao: {
      app_key: cfg.youdao.appKey,
      app_secret: cfg.youdao.appSecret,
    },
    hotkey_selection: cfg.hotkeySelection,
    hotkey_screenshot: cfg.hotkeyScreenshot,
    launch_on_startup: cfg.launchOnStartup,
    auto_copy: cfg.autoCopy,
    theme: cfg.theme,
    floating_pinned: cfg.floatingPinned,
    floating_window_x: cfg.floatingWindowX,
    floating_window_y: cfg.floatingWindowY,
    first_run: cfg.firstRun,
    bidirectional_auto: cfg.bidirectionalAuto,
    bidirectional_lang_a: cfg.bidirectionalLangA,
    bidirectional_lang_b: cfg.bidirectionalLangB,
  }
}
