/**
 * 应用设置 Hook - 管理应用全局设置的读取、更新和持久化
 * 支持 SQLite 数据库存储和 localStorage 降级方案
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { AppSettings } from '@clipboard/types'
import { invoke } from '@tauri-apps/api/core'
import { DEFAULT_THEME, DEFAULT_CUSTOM_HUE, MAX_BACKGROUND_OPACITY, MIN_BACKGROUND_OPACITY } from '@clipboard/lib/theme'
import { DEFAULT_GLOBAL_SHORTCUT } from '@clipboard/lib/shortcuts'
import { loadSettingsFromDb, saveSettingsToDb } from '@clipboard/services/database'
import { hexToHue } from '@clipboard/lib/color'
import { sanitizeHistoryMaxItems, sanitizeHistoryRetentionDays } from '@clipboard/lib/history-settings'

const STORAGE_KEY = 'kitty-clipboard-history:settings'
const STORAGE_SCHEMA_VERSION = 11

type StoredSettings = Partial<AppSettings> & {
  storageSchemaVersion?: number
  customTheme?: { primary?: string }
}

type StoredClipboardSettings = Pick<
  AppSettings,
  | 'showPreview'
  | 'pasteOnEnter'
  | 'hideWhenUnfocused'
  | 'historyMaxItems'
  | 'historyRetentionDays'
  | 'globalShortcut'
  | 'disableTextSelection'
>

const DEFAULT_SETTINGS: AppSettings = {
  showPreview: true,
  pasteOnEnter: true,
  hideWhenUnfocused: true,
  historyMaxItems: 100,
  historyRetentionDays: 7,
  backgroundOpacity: 72,
  theme: DEFAULT_THEME,
  customHue: DEFAULT_CUSTOM_HUE,
  colorMode: 'system',
  globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
  disableTextSelection: true
}

function toStoredClipboardSettings(settings: AppSettings): StoredClipboardSettings {
  return {
    showPreview: settings.showPreview,
    pasteOnEnter: settings.pasteOnEnter,
    hideWhenUnfocused: settings.hideWhenUnfocused,
    historyMaxItems: settings.historyMaxItems,
    historyRetentionDays: settings.historyRetentionDays,
    globalShortcut: settings.globalShortcut,
    disableTextSelection: settings.disableTextSelection,
  }
}

const VALID_THEMES = new Set<AppSettings['theme']>(['default', 'ocean', 'forest', 'sunset', 'custom'])

function sanitizeSettings(settings: Partial<AppSettings> & { customTheme?: { primary?: string } }): AppSettings {
  const { performanceDiagnosticsEnabled: _omitDiagnostics, statusBarEnabled: _omitStatusBar, ...rest } =
    settings as Partial<AppSettings> & {
      performanceDiagnosticsEnabled?: boolean
      statusBarEnabled?: boolean
      customTheme?: { primary?: string }
    }
  const rawTheme = (rest as { theme?: string }).theme
  const rawColorMode = rest.colorMode
  const rawShortcut = rest.globalShortcut
  const legacyTheme = rawTheme === 'graphite' ? DEFAULT_THEME : rawTheme
  const colorMode =
    rawColorMode === 'light' || rawColorMode === 'dark' || rawColorMode === 'system'
      ? rawColorMode
      : DEFAULT_SETTINGS.colorMode
  const globalShortcut =
    typeof rawShortcut === 'string' && rawShortcut.trim() ? rawShortcut.trim() : DEFAULT_SETTINGS.globalShortcut
  const rawHideUnfocused = (rest as { hideWhenUnfocused?: unknown }).hideWhenUnfocused
  const hideWhenUnfocused =
    typeof rawHideUnfocused === 'boolean' ? rawHideUnfocused : DEFAULT_SETTINGS.hideWhenUnfocused
  const rawDisableTextSelection = (rest as { disableTextSelection?: unknown }).disableTextSelection
  const disableTextSelection =
    typeof rawDisableTextSelection === 'boolean' ? rawDisableTextSelection : DEFAULT_SETTINGS.disableTextSelection
  const historyMaxItems = sanitizeHistoryMaxItems(rest.historyMaxItems, DEFAULT_SETTINGS.historyMaxItems)
  const historyRetentionDays = sanitizeHistoryRetentionDays(
    rest.historyRetentionDays,
    DEFAULT_SETTINGS.historyRetentionDays
  )
  const backgroundOpacity =
    typeof rest.backgroundOpacity === 'number'
      ? Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, rest.backgroundOpacity))
      : DEFAULT_SETTINGS.backgroundOpacity
  const customHue =
    typeof rest.customHue === 'number' && rest.customHue >= 0 && rest.customHue <= 360
      ? rest.customHue
      : rest.customTheme?.primary
        ? hexToHue(rest.customTheme.primary)
        : DEFAULT_CUSTOM_HUE
  const theme =
    legacyTheme && VALID_THEMES.has(legacyTheme as AppSettings['theme'])
      ? (legacyTheme as AppSettings['theme'])
      : DEFAULT_SETTINGS.theme

  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    backgroundOpacity,
    theme,
    customHue,
    colorMode,
    globalShortcut,
    hideWhenUnfocused,
    disableTextSelection,
    historyMaxItems,
    historyRetentionDays
  }
}

function loadSettingsFromLocalStorage(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return DEFAULT_SETTINGS
    }

    const parsed = JSON.parse(raw) as StoredSettings

    return sanitizeSettings({
      ...parsed,
    })
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const isLoadingRef = useRef(true)
  const lastPersistedSettingsJsonRef = useRef<string>('')

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const raw = await loadSettingsFromDb()

        if (cancelled) return

        if (raw) {
          lastPersistedSettingsJsonRef.current = raw
          const parsed = JSON.parse(raw) as StoredSettings
          setSettings(
            sanitizeSettings({
              ...parsed,
            })
          )
        } else {
          const legacySettings = loadSettingsFromLocalStorage()
          if (legacySettings !== DEFAULT_SETTINGS) {
            setSettings(legacySettings)
            const migratedJson = JSON.stringify({
              ...toStoredClipboardSettings(legacySettings),
              storageSchemaVersion: STORAGE_SCHEMA_VERSION
            })
            await saveSettingsToDb(migratedJson)
            if (cancelled) return
            lastPersistedSettingsJsonRef.current = migratedJson
            window.localStorage.removeItem(STORAGE_KEY)
          }
        }
      } catch (error) {
        console.error('Failed to load settings from database:', error)
        if (!cancelled) {
          setSettings(loadSettingsFromLocalStorage())
        }
      } finally {
        if (!cancelled) {
          isLoadingRef.current = false
          setIsLoading(false)
        }
      }
    }

    void init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen('app-settings-sync', async () => {
      try {
        const raw = await loadSettingsFromDb()
        if (!raw || raw === lastPersistedSettingsJsonRef.current) {
          return
        }
        lastPersistedSettingsJsonRef.current = raw
        const parsed = JSON.parse(raw) as StoredSettings
        setSettings(
          sanitizeSettings({
            ...parsed,
          }),
        )
      } catch (error) {
        console.error('跨窗口同步设置失败:', error)
      }
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (isLoadingRef.current) return

    const timeout = setTimeout(() => {
      const payload = JSON.stringify({
        ...toStoredClipboardSettings(settings),
        storageSchemaVersion: STORAGE_SCHEMA_VERSION
      })
      void saveSettingsToDb(payload)
        .then(() => {
          lastPersistedSettingsJsonRef.current = payload
          return emit('app-settings-sync', {})
        })
        .catch((error) => {
          console.error('Failed to save settings:', error)
        })
    }, 300)

    return () => clearTimeout(timeout)
  }, [settings])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => sanitizeSettings({ ...prev, ...patch }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  useEffect(() => {
    if (isLoading) {
      return
    }
    void invoke('clipboard_update_shortcut', {
      shortcut: settings.globalShortcut,
    }).catch((error) => {
      console.error('Failed to sync global shortcut:', error)
    })
  }, [isLoading, settings.globalShortcut])

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoading
  }
}
