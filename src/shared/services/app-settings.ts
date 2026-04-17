import Database from '@tauri-apps/plugin-sql'
import type { AppSettings } from '@/shared/types/app'
import { DEFAULT_APP_SETTINGS } from '@/shared/types/app'

const DB_PATH = 'sqlite:kitty-app.db'
const SETTINGS_KEY = 'app_settings'

let dbInstance: Database | null = null

type SettingsRow = {
  value: string
}

async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance
  }

  dbInstance = await Database.load(DB_PATH)
  await dbInstance.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  return dbInstance
}

export async function loadAppSettings(): Promise<AppSettings> {
  const db = await getDb()
  const rows = await db.select<SettingsRow[]>('SELECT value FROM settings WHERE key = $1', [SETTINGS_KEY])
  if (rows.length === 0) {
    return DEFAULT_APP_SETTINGS
  }

  try {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...(JSON.parse(rows[0].value) as Partial<AppSettings>),
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const db = await getDb()
  await db.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
    [SETTINGS_KEY, JSON.stringify(settings), Date.now()],
  )
}
