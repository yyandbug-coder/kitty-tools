import { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { AppModuleId, AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS } from '@/shared/types/app'
import { loadAppSettings, saveAppSettings } from '@/shared/services/app-settings'

const GLOBAL_SETTINGS_SYNC_EVENT = 'global-app-settings-sync'

export function useGlobalAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const isLoadingRef = useRef(true)
  const lastPersistedSettingsJsonRef = useRef('')

  useEffect(() => {
    let cancelled = false

    void loadAppSettings()
      .then((next) => {
        if (!cancelled) {
          const merged = { ...DEFAULT_APP_SETTINGS, ...next }
          setSettings(merged)
          lastPersistedSettingsJsonRef.current = JSON.stringify(merged)
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
        const merged = { ...DEFAULT_APP_SETTINGS, ...next }
        const serialized = JSON.stringify(merged)
        if (serialized === lastPersistedSettingsJsonRef.current) {
          return
        }
        lastPersistedSettingsJsonRef.current = serialized
        setSettings(merged)
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
    if (isLoadingRef.current) {
      return
    }

    const timeout = window.setTimeout(() => {
      const payload = JSON.stringify(settings)
      void saveAppSettings(settings)
        .then(() => {
          lastPersistedSettingsJsonRef.current = payload
          return emit(GLOBAL_SETTINGS_SYNC_EVENT, {})
        })
        .catch((error) => {
          console.error('Failed to save global app settings:', error)
        })
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [settings])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings((prev) => ({
      ...DEFAULT_APP_SETTINGS,
      lastActiveModule: prev.lastActiveModule,
    }))
  }, [])

  const setLastActiveModule = useCallback((moduleId: AppModuleId) => {
    setSettings((prev) => ({ ...prev, lastActiveModule: moduleId }))
  }, [])

  return {
    settings,
    loaded,
    updateSettings,
    resetSettings,
    setLastActiveModule,
  }
}
