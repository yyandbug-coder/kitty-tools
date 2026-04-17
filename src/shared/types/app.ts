import type { AppConfig as TranslateFeatureSettings } from '@translate/types'
import type { AppSettings as ClipboardFeatureSettings } from '@clipboard/types'

export type AppModuleId = 'clipboard-history' | 'translate' | 'settings'

export interface AppSettings {
  lastActiveModule: AppModuleId
  theme: ClipboardFeatureSettings['theme']
  customHue: ClipboardFeatureSettings['customHue']
  colorMode: ClipboardFeatureSettings['colorMode']
  backgroundOpacity: ClipboardFeatureSettings['backgroundOpacity']
  launchOnStartup: TranslateFeatureSettings['launchOnStartup']
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastActiveModule: 'settings',
  theme: 'default',
  customHue: 160,
  colorMode: 'system',
  backgroundOpacity: 72,
  launchOnStartup: false,
}

export type ClipboardHistorySettings = ClipboardFeatureSettings
export type TranslateSettings = TranslateFeatureSettings
