import { useEffect, useState } from 'react'
import { loadAppSettings, saveAppSettings } from '@/shared/services/app-settings'
import type { AppModuleId, AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS } from '@/shared/types/app'

export function useWorkspaceSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    void loadAppSettings()
      .then((next) => {
        if (!cancelled) {
          setSettings(next)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!loaded) {
      return
    }

    const timeout = window.setTimeout(() => {
      void saveAppSettings(settings).catch((error) => {
        console.error('Failed to save workspace settings:', error)
      })
    }, 150)

    return () => window.clearTimeout(timeout)
  }, [loaded, settings])

  const setLastActiveModule = (moduleId: AppModuleId) => {
    setSettings((prev) => ({ ...prev, lastActiveModule: moduleId }))
  }

  return {
    settings,
    loaded,
    setLastActiveModule,
  }
}
