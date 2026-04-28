/**
 * 数据库服务 - 封装 SQLite 数据库连接的初始化和访问
 * 使用单例模式确保全局只创建一个数据库连接
 */
import dayjs from 'dayjs'
import Database from '@tauri-apps/plugin-sql'
import type { ClipboardItem } from '@/types'
import {
  CLIPBOARD_HISTORY_LEGACY_SETTINGS_KEY,
  ensureClipboardHistorySchema,
  loadClipboardHistoryRows,
  replaceClipboardHistoryWithConnection,
} from '@/services/clipboard-history-db'

const DB_PATH = 'sqlite:kitty-settings.db'
const SETTINGS_KEY = 'app-settings'

let dbPromise: Promise<Database> | null = null

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_PATH)
      .then(async (db) => {
        await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `)
        await ensureClipboardHistorySchema(db)
        await db.execute(`DELETE FROM settings WHERE key = $1`, [CLIPBOARD_HISTORY_LEGACY_SETTINGS_KEY])
        return db
      })
      .catch((err) => {
        dbPromise = null
        throw err
      })
  }
  return dbPromise
}

interface SettingsRow {
  key: string
  value: string
  updated_at: number
}

export async function loadSettingsFromDb(): Promise<string | null> {
  const db = await getDb()
  const rows = await db.select<SettingsRow[]>(
    'SELECT value FROM settings WHERE key = $1',
    [SETTINGS_KEY],
  )
  return rows.length > 0 ? rows[0].value : null
}

export async function saveSettingsToDb(value: string): Promise<void> {
  await saveKeyValueToDb(SETTINGS_KEY, value)
}

export async function loadClipboardHistoryItemsFromDb(): Promise<ClipboardItem[]> {
  const db = await getDb()
  return loadClipboardHistoryRows(db)
}

export async function replaceClipboardHistoryInDb(items: ClipboardItem[]): Promise<void> {
  const db = await getDb()
  await replaceClipboardHistoryWithConnection(db, items)
}

async function saveKeyValueToDb(key: string, value: string): Promise<void> {
  const db = await getDb()
  const now = dayjs().valueOf()
  await db.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = $3`,
    [key, value, now],
  )
}
