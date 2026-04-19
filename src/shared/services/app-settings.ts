import type { AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '@/shared/types/app'
import { createSqliteKeyValueStore } from '@/shared/services/sqlite-kv'

const DB_PATH = 'sqlite:kitty-app.db'
const SETTINGS_KEY = 'app_settings'
const appSettingsStore = createSqliteKeyValueStore({ dbPath: DB_PATH })

export async function loadAppSettings(): Promise<AppSettings> {
  const raw = await appSettingsStore.loadValue(SETTINGS_KEY)
  if (!raw) {
    return DEFAULT_APP_SETTINGS
  }

  try {
    return sanitizeAppSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const sanitizedSettings = sanitizeAppSettings(settings)
  await appSettingsStore.saveValue(SETTINGS_KEY, JSON.stringify(sanitizedSettings))
}
