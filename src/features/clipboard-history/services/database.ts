/**
 * 数据库服务 - 封装剪贴板历史相关的 SQLite KV 访问
 */
import { createSqliteKeyValueStore } from '@/shared/services/sqlite-kv'

const DB_PATH = 'sqlite:kitty-settings.db'
const SETTINGS_KEY = 'app-settings'
const HISTORY_KEY = 'clipboard-history'
const clipboardStore = createSqliteKeyValueStore({ dbPath: DB_PATH })

export async function loadSettingsFromDb(): Promise<string | null> {
  return clipboardStore.loadValue(SETTINGS_KEY)
}

export async function saveSettingsToDb(value: string): Promise<void> {
  await clipboardStore.saveValue(SETTINGS_KEY, value)
}

export async function loadClipboardHistoryFromDb(): Promise<string | null> {
  return clipboardStore.loadValue(HISTORY_KEY)
}

export async function saveClipboardHistoryToDb(value: string): Promise<void> {
  await clipboardStore.saveValue(HISTORY_KEY, value)
}
