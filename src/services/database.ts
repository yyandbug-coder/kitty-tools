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

/**
 * 剪贴板历史全表替换写入队列。同一连接上对 clipboard_history 的 BEGIN…COMMIT
 * 与另一次写入重叠时会触发 SQLITE_BUSY（database is locked），故必须串行化。
 */
let clipboardReplaceQueue: Promise<void> = Promise.resolve()

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
        // 提升并发读与批量写入表现（WAL 会生成 -wal 文件，属 SQLite 正常行为）
        await db.execute('PRAGMA journal_mode = WAL').catch(() => {
          /* 部分环境可能拒绝 PRAGMA */
        })
        await db.execute('PRAGMA synchronous = NORMAL').catch(() => {})
        await db.execute('PRAGMA busy_timeout = 5000').catch(() => {})
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
  const run = clipboardReplaceQueue.then(async () => {
    const db = await getDb()
    await replaceClipboardHistoryWithConnection(db, items)
  })
  clipboardReplaceQueue = run.catch(() => {
    /* 单次失败不打断队列，reject 仍会传给下方 await run */
  })
  return run
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
