import { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { AppModuleId, AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '@/shared/types/app'
import { loadAppSettings, saveAppSettings } from '@/shared/services/app-settings'

const GLOBAL_SETTINGS_SYNC_EVENT = 'global-app-settings-sync'
type AppSettingsKey = keyof AppSettings

function mergeSettings(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return { ...base, ...patch }
}

function mergeDirtySettings(
  base: AppSettings,
  current: AppSettings,
  dirtyKeys: Iterable<AppSettingsKey>,
): AppSettings {
  const next = { ...base }
  const writableNext = next as Record<AppSettingsKey, AppSettings[AppSettingsKey]>
  for (const key of dirtyKeys) {
    writableNext[key] = current[key]
  }
  return next
}

function markDirtyKeys(target: Set<AppSettingsKey>, patch: Partial<AppSettings>) {
  for (const key of Object.keys(patch) as AppSettingsKey[]) {
    target.add(key)
  }
}

function getPersistedSettingsSnapshot(serializedSettings: string): AppSettings | null {
  if (!serializedSettings) {
    return null
  }

  try {
    return sanitizeAppSettings(JSON.parse(serializedSettings) as Partial<AppSettings>)
  } catch {
    return null
  }
}

export function useGlobalAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const settingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS)
  const isLoadingRef = useRef(true)
  const lastPersistedSettingsJsonRef = useRef('')
  const dirtyKeysRef = useRef<Set<AppSettingsKey>>(new Set())

  const applyLocalPatch = useCallback((patch: Partial<AppSettings>) => {
    markDirtyKeys(dirtyKeysRef.current, patch)
    setSettings((prev) => {
      const next = mergeSettings(prev, patch)
      settingsRef.current = next
      return next
    })
  }, [])

  const syncFromStorage = useCallback((next: AppSettings) => {
    const merged = mergeDirtySettings(next, settingsRef.current, dirtyKeysRef.current)
    settingsRef.current = merged
    setSettings(merged)
  }, [])

  useEffect(() => {
    let cancelled = false

    void loadAppSettings()
      .then((next) => {
        if (!cancelled) {
          lastPersistedSettingsJsonRef.current = JSON.stringify(next)
          syncFromStorage(next)
        }
      })
      .finally(() => {
        if (!cancelled) {
          isLoadingRef.current = false
          setLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void listen(GLOBAL_SETTINGS_SYNC_EVENT, async () => {
      try {
        const next = await loadAppSettings()
        const serialized = JSON.stringify(next)
        if (serialized === lastPersistedSettingsJsonRef.current) {
          return
        }
        lastPersistedSettingsJsonRef.current = serialized
        syncFromStorage(next)
      } catch (error) {
        console.error('Failed to sync global app settings:', error)
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    if (isLoadingRef.current || dirtyKeysRef.current.size === 0) {
      return
    }

    const settingsSnapshot = settings
    const dirtyKeysSnapshot = [...dirtyKeysRef.current]

    const timeout = window.setTimeout(() => {
      const persistedFallback =
        getPersistedSettingsSnapshot(lastPersistedSettingsJsonRef.current) ?? settingsRef.current

      void loadAppSettings()
        .catch(() => persistedFallback)
        .then((latest) => {
          const nextToPersist = mergeDirtySettings(latest, settingsSnapshot, dirtyKeysSnapshot)
          const payload = JSON.stringify(nextToPersist)

          if (payload === lastPersistedSettingsJsonRef.current) {
            for (const key of dirtyKeysSnapshot) {
              if (settingsRef.current[key] === settingsSnapshot[key]) {
                dirtyKeysRef.current.delete(key)
              }
            }
            return
          }

          return saveAppSettings(nextToPersist).then(() => {
            lastPersistedSettingsJsonRef.current = payload
            for (const key of dirtyKeysSnapshot) {
              if (settingsRef.current[key] === settingsSnapshot[key]) {
                dirtyKeysRef.current.delete(key)
              }
            }
            syncFromStorage(nextToPersist)
            return emit(GLOBAL_SETTINGS_SYNC_EVENT, {})
          })
        })
        .catch((error) => {
          console.error('Failed to save global app settings:', error)
        })
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [settings])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    applyLocalPatch(patch)
  }, [applyLocalPatch])

  const resetSettings = useCallback(() => {
    const {
      lastActiveModule: _lastActiveModule,
      ...resettableSettings
    } = DEFAULT_APP_SETTINGS
    markDirtyKeys(dirtyKeysRef.current, resettableSettings)
    setSettings((prev) => {
      const next = {
        ...DEFAULT_APP_SETTINGS,
        lastActiveModule: prev.lastActiveModule,
      }
      settingsRef.current = next
      return next
    })
  }, [])

  const setLastActiveModule = useCallback((moduleId: AppModuleId) => {
    applyLocalPatch({ lastActiveModule: moduleId })
  }, [applyLocalPatch])

  return {
    settings,
    loaded,
    updateSettings,
    resetSettings,
    setLastActiveModule,
  }
}
