import type { AppConfig as TranslateFeatureSettings } from '@translate/types'
import type { AppSettings as ClipboardFeatureSettings } from '@clipboard/types'

export type AppModuleId = 'clipboard-history' | 'translate' | 'settings'
export const APP_MODULE_IDS = ['clipboard-history', 'translate', 'settings'] as const
const APP_THEME_IDS = ['default', 'ocean', 'forest', 'sunset', 'custom'] as const
const APP_COLOR_MODES = ['system', 'light', 'dark'] as const
const MIN_BACKGROUND_OPACITY = 35
const MAX_BACKGROUND_OPACITY = 95
const MIN_CUSTOM_HUE = 0
const MAX_CUSTOM_HUE = 360

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

export function isAppModuleId(value: unknown): value is AppModuleId {
  return typeof value === 'string' && APP_MODULE_IDS.includes(value as AppModuleId)
}

function isAppTheme(value: unknown): value is AppSettings['theme'] {
  return typeof value === 'string' && APP_THEME_IDS.includes(value as AppSettings['theme'])
}

function isColorMode(value: unknown): value is AppSettings['colorMode'] {
  return typeof value === 'string' && APP_COLOR_MODES.includes(value as AppSettings['colorMode'])
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.min(max, Math.max(min, value))
}

export function sanitizeAppSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  const next = settings ?? {}

  return {
    lastActiveModule: isAppModuleId(next.lastActiveModule)
      ? next.lastActiveModule
      : DEFAULT_APP_SETTINGS.lastActiveModule,
    theme: isAppTheme(next.theme) ? next.theme : DEFAULT_APP_SETTINGS.theme,
    customHue: clampNumber(
      next.customHue,
      DEFAULT_APP_SETTINGS.customHue,
      MIN_CUSTOM_HUE,
      MAX_CUSTOM_HUE,
    ),
    colorMode: isColorMode(next.colorMode) ? next.colorMode : DEFAULT_APP_SETTINGS.colorMode,
    backgroundOpacity: clampNumber(
      next.backgroundOpacity,
      DEFAULT_APP_SETTINGS.backgroundOpacity,
      MIN_BACKGROUND_OPACITY,
      MAX_BACKGROUND_OPACITY,
    ),
    launchOnStartup:
      typeof next.launchOnStartup === 'boolean'
        ? next.launchOnStartup
        : DEFAULT_APP_SETTINGS.launchOnStartup,
  }
}

export type ClipboardHistorySettings = ClipboardFeatureSettings
export type TranslateSettings = TranslateFeatureSettings
