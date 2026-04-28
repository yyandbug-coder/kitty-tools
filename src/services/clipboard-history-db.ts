/**
 * 剪贴板历史 — SQLite 表读写（clipboard_history）
 * 一行一条记录；不落库 imageRgba（与旧版 JSON 一致，图片走磁盘缓存）
 */
import type { ClipboardItem, ClipboardType } from '@/types'
import type Database from '@tauri-apps/plugin-sql'

/** 旧版整包 JSON 在 settings 中的 key；建库时删除，不迁移数据 */
export const CLIPBOARD_HISTORY_LEGACY_SETTINGS_KEY = 'clipboard-history'

const TABLE = 'clipboard_history'

const INSERT_COLS =
  'id, type, content, content_hash, image_byte_size, file_byte_sizes, file_paths, image_width, image_height, timestamp, source_app, source_app_path, favorited'

interface ClipboardHistorySqlRow {
  id: string
  type: string
  content: string | null
  content_hash: string | null
  image_byte_size: number | null
  file_byte_sizes: string | null
  file_paths: string | null
  image_width: number | null
  image_height: number | null
  timestamp: number
  source_app: string | null
  source_app_path: string | null
  favorited: number
}

export async function ensureClipboardHistorySchema(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      image_byte_size INTEGER,
      file_byte_sizes TEXT,
      file_paths TEXT,
      image_width INTEGER,
      image_height INTEGER,
      timestamp INTEGER NOT NULL,
      source_app TEXT,
      source_app_path TEXT,
      favorited INTEGER NOT NULL DEFAULT 0
    )
  `)
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_clipboard_history_ts ON ${TABLE}(timestamp DESC)`)
}

function parseJsonStringArray(raw: string | null): string[] | undefined {
  if (raw == null || raw === '') return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return undefined
    const paths = v.filter((x): x is string => typeof x === 'string')
    return paths.length > 0 ? paths : undefined
  } catch {
    return undefined
  }
}

function parseJsonNumberArray(raw: string | null): number[] | undefined {
  if (raw == null || raw === '') return undefined
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return undefined
    const nums = v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    return nums.length > 0 ? nums : undefined
  } catch {
    return undefined
  }
}

function rowToClipboardItem(r: ClipboardHistorySqlRow): ClipboardItem {
  const type = r.type as ClipboardType
  const item: ClipboardItem = {
    id: r.id,
    type,
    content: r.content ?? '',
    timestamp: r.timestamp,
    favorited: Boolean(r.favorited),
  }
  if (r.content_hash) item.contentHash = r.content_hash
  if (r.image_byte_size != null) item.imageByteSize = r.image_byte_size
  const filePaths = parseJsonStringArray(r.file_paths)
  if (filePaths) item.filePaths = filePaths
  const fileByteSizes = parseJsonNumberArray(r.file_byte_sizes)
  if (fileByteSizes) item.fileByteSizes = fileByteSizes
  if (r.image_width != null) item.imageWidth = r.image_width
  if (r.image_height != null) item.imageHeight = r.image_height
  if (r.source_app) item.sourceApp = r.source_app
  if (r.source_app_path) item.sourceAppPath = r.source_app_path
  return item
}

export async function loadClipboardHistoryRows(db: Database): Promise<ClipboardItem[]> {
  const rows = await db.select<ClipboardHistorySqlRow[]>(
    `SELECT ${INSERT_COLS} FROM ${TABLE} ORDER BY timestamp DESC`,
  )
  return rows.map(rowToClipboardItem)
}
