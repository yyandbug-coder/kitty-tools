import type { AppConfig as TranslateFeatureSettings } from '@translate/types'
import type { AppSettings as ClipboardFeatureSettings } from '@clipboard/types'

export type AppModuleId = 'clipboard-history' | 'translate' | 'settings'

export interface AppSettings {
  lastActiveModule: AppModuleId
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  lastActiveModule: 'translate',
}

export type ClipboardHistorySettings = ClipboardFeatureSettings
export type TranslateSettings = TranslateFeatureSettings
