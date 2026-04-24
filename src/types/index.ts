// Clipboard types
export type ClipboardType = 'text' | 'image' | 'file';
export type AppTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'custom';
export type ColorMode = 'system' | 'light' | 'dark';

export interface ClipboardItem {
  id: string;
  type: ClipboardType;
  content: string;
  contentHash?: string;
  imageByteSize?: number;
  fileByteSizes?: number[];
  filePaths?: string[];
  imageRgba?: number[];
  imageWidth?: number;
  imageHeight?: number;
  timestamp: number;
  sourceApp?: string;
  sourceAppPath?: string;
  favorited?: boolean;
}

// Translate types
export interface Language {
  code: string;
  name: string;
}

export interface TranslateResult {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
}

export interface TranslateRequest {
  text: string;
  source_lang: string;
  target_lang: string;
}

export type TranslateProvider = 'baidu' | 'google' | 'youdao' | 'openai';

export interface BaiduProviderConfig {
  appId: string;
  secret: string;
  ocrApiKey: string;
  ocrSecretKey: string;
  ocrAipBaseUrl: string;
}

export interface GoogleProviderConfig {
  apiKey: string;
  visionApiUrl: string;
  translateApiUrl: string;
}

export interface OpenaiProviderConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
}

export interface YoudaoProviderConfig {
  appKey: string;
  appSecret: string;
}

export interface AppConfig {
  theme: string;
  launchOnStartup: boolean;
  firstRun: boolean;
  appThemePreset: string;
  customHue: number;
  backgroundOpacity: number;
  clipboardShortcut: string;
  clipboardHideOnUnfocus: boolean;
  clipboardHistoryMax: number;
  clipboardHistoryRetentionDays: number;
  clipboardShowPreview: boolean;
  clipboardPasteOnEnter: boolean;
  clipboardDisableTextSelection: boolean;
  sourceLang: string;
  targetLang: string;
  translateProvider: TranslateProvider;
  baidu: BaiduProviderConfig;
  google: GoogleProviderConfig;
  openai: OpenaiProviderConfig;
  youdao: YoudaoProviderConfig;
  hotkeySelection: string;
  hotkeyScreenshot: string;
  autoCopy: boolean;
  floatingPinned: boolean;
  floatingWindowX: number | null;
  floatingWindowY: number | null;
  bidirectionalAuto: boolean;
  bidirectionalLangA: string;
  bidirectionalLangB: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'auto', name: '自动检测' },
  { code: 'zh-CN', name: '中文' },
  { code: 'en', name: '英语' },
  { code: 'ja', name: '日语' },
  { code: 'ko', name: '韩语' },
  { code: 'fr', name: '法语' },
  { code: 'de', name: '德语' },
  { code: 'es', name: '西班牙语' },
  { code: 'ru', name: '俄语' },
  { code: 'pt', name: '葡萄牙语' },
  { code: 'it', name: '意大利语' },
  { code: 'zh-TW', name: '繁体中文' },
];

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  launchOnStartup: false,
  firstRun: true,
  appThemePreset: 'default',
  customHue: 160,
  backgroundOpacity: 72,
  clipboardShortcut: 'CommandOrControl+Shift+V',
  clipboardHideOnUnfocus: true,
  clipboardHistoryMax: 100,
  clipboardHistoryRetentionDays: 7,
  clipboardShowPreview: true,
  clipboardPasteOnEnter: true,
  clipboardDisableTextSelection: true,
  sourceLang: 'auto',
  targetLang: 'auto',
  translateProvider: 'youdao',
  baidu: { appId: '', secret: '', ocrApiKey: '', ocrSecretKey: '', ocrAipBaseUrl: '' },
  google: { apiKey: '', visionApiUrl: '', translateApiUrl: '' },
  openai: { apiBaseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
  youdao: { appKey: '', appSecret: '' },
  hotkeySelection: 'CommandOrControl+Shift+T',
  hotkeyScreenshot: 'CommandOrControl+Shift+S',
  autoCopy: true,
  floatingPinned: false,
  floatingWindowX: null,
  floatingWindowY: null,
  bidirectionalAuto: true,
  bidirectionalLangA: 'zh-CN',
  bidirectionalLangB: 'en',
};

export function getLanguageDisplayName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || code;
}

export function getProviderDisplayName(provider: TranslateProvider): string {
  const map: Record<TranslateProvider, string> = {
    baidu: '百度翻译',
    google: 'Google',
    openai: 'OpenAI',
    youdao: '有道翻译',
  };
  return map[provider] || provider;
}

export function appConfigToRust(config: Partial<AppConfig>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    const rustKey = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
    result[rustKey] = value;
  }
  return result;
}
