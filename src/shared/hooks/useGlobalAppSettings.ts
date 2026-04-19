import { useCallback, useRef } from 'react'
import type { AppModuleId, AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '@/shared/types/app'
import { loadAppSettings, saveAppSettings } from '@/shared/services/app-settings'
import { usePersistedSyncState } from '@/shared/hooks/usePersistedSyncState'

const GLOBAL_SETTINGS_SYNC_EVENT = 'global-app-settings-sync'
type AppSettingsKey = keyof AppSettings

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
  const dirtyKeysRef = useRef<Set<AppSettingsKey>>(new Set())
  const {
    state: settings,
    loaded,
    updateState,
  } = usePersistedSyncState<AppSettings>({
    initialState: DEFAULT_APP_SETTINGS,
    syncEvent: GLOBAL_SETTINGS_SYNC_EVENT,
    loadState: loadAppSettings,
    persistState: saveAppSettings,
    serializeState: (next) => JSON.stringify(next),
    saveDelayMs: 150,
    mergeLoadedState: (loadedState, currentState) =>
      mergeDirtySettings(loadedState, currentState, dirtyKeysRef.current),
    prepareStateForPersist: async (
      settingsSnapshot,
      { currentState, lastPersistedSerialized },
    ): Promise<AppSettings> => {
      if (dirtyKeysRef.current.size === 0) {
        return settingsSnapshot
      }

      const dirtyKeysSnapshot = [...dirtyKeysRef.current]
      const persistedFallback =
        getPersistedSettingsSnapshot(lastPersistedSerialized) ?? currentState
      const latest = await loadAppSettings().catch(() => persistedFallback)

      return mergeDirtySettings(latest, settingsSnapshot, dirtyKeysSnapshot)
    },
    onSyncError: (error) => {
      console.error('Failed to sync global app settings:', error)
    },
    onPersistError: (error) => {
      console.error('Failed to save global app settings:', error)
    },
    onPersisted: (_persistedState, snapshotState, { currentState }) => {
      for (const key of [...dirtyKeysRef.current]) {
        if (currentState[key] === snapshotState[key]) {
          dirtyKeysRef.current.delete(key)
        }
      }
    },
  })

  const applyLocalPatch = useCallback((patch: Partial<AppSettings>) => {
    markDirtyKeys(dirtyKeysRef.current, patch)
    updateState((prev) => ({ ...prev, ...patch }))
  }, [updateState])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    applyLocalPatch(patch)
  }, [applyLocalPatch])

  const resetSettings = useCallback(() => {
    const {
      lastActiveModule: _lastActiveModule,
      ...resettableSettings
    } = DEFAULT_APP_SETTINGS
    markDirtyKeys(dirtyKeysRef.current, resettableSettings)
    updateState((prev) => {
      const next = {
        ...DEFAULT_APP_SETTINGS,
        lastActiveModule: prev.lastActiveModule,
      }
      return next
    })
  }, [updateState])

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
