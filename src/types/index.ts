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

/** 启动器文件搜索：默认跳过的目录名（单级匹配，忽略大小写），与后端 `default_launcher_file_search_excluded_dir_names` 一致 */
export const DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES: string[] = [
  'node_modules',
  'dist',
  'target',
  '.git',
  'build',
  'bower_components',
];

/** 启动器单行结果（后端 `launcher_query`） */
export interface LauncherItem {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  payload: string;
  /** 存在时用于 `get_app_icon_data_url` 拉取本机 .exe / .app 等图标 */
  iconPath?: string | null;
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
  /** 启动器全局快捷键；空字符串表示不注册 */
  launcherShortcut: string;
  /**
   * 失焦时是否自动隐藏启动器。
   * 为 false 时工具栏为「已固定」：失焦不关闭，与剪贴板固定一致。
   */
  launcherHideOnUnfocus: boolean;
  /** 启动器：是否索引 Chrome 书签 */
  launcherBookmarksChrome: boolean;
  /** 启动器：是否索引 Edge 书签 */
  launcherBookmarksEdge: boolean;
  /** 启动器：是否索引 Brave 书签 */
  launcherBookmarksBrave: boolean;
  /** 启动器：是否启用本地文件名搜索 */
  launcherFileSearchEnabled: boolean;
  /** 文件搜索根目录列表；空则使用系统「文档」 */
  launcherFileSearchPaths: string[];
  /** 遍历时跳过的目录名（仅匹配路径中一级文件夹名，忽略大小写） */
  launcherFileSearchExcludedDirNames: string[];
  /** 启动器窗口上次内宽（px），未设则用默认 */
  launcherWindowWidth: number | null;
  /** 启动器窗口上次内高（px） */
  launcherWindowHeight: number | null;
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
  /** 目标语言不设为 auto：设置页下拉排除了 auto，否则未选过时触发器会空白 */
  targetLang: 'zh-CN',
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
  launcherShortcut: 'Alt+Space',
  launcherHideOnUnfocus: true,
  launcherBookmarksChrome: false,
  launcherBookmarksEdge: false,
  launcherBookmarksBrave: false,
  launcherFileSearchEnabled: true,
  launcherFileSearchPaths: [],
  launcherFileSearchExcludedDirNames: [...DEFAULT_LAUNCHER_FILE_SEARCH_EXCLUDED_DIR_NAMES],
  launcherWindowWidth: null,
  launcherWindowHeight: null,
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
