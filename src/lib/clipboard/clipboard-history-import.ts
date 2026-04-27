/**
 * 从本地 JSON 解析剪贴板历史：支持「条目数组」或「含 history 数组的对象」。
 */
import type { ClipboardItem, ClipboardType } from '@/types'
import { ensureClipboardItemHasUuid, normalizeSyncMergedHistory } from '@/lib/clipboard/cloud-sync'

function extractHistoryArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed
  }
  if (parsed && typeof parsed === 'object' && 'history' in parsed) {
    const h = (parsed as { history: unknown }).history
    if (Array.isArray(h)) {
      return h
    }
  }
  throw new Error('JSON 须为剪贴板条目数组，或包含 history 数组的对象。')
}

function isClipboardType(value: unknown): value is ClipboardType {
  return value === 'text' || value === 'image' || value === 'file'
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) {
      return n
    }
  }
  return Date.now()
}

function readFilePaths(obj: Record<string, unknown>): string[] | undefined {
  const raw = obj.filePaths ?? obj.file_paths
  if (!Array.isArray(raw)) {
    return undefined
  }
  const paths = raw.filter((x): x is string => typeof x === 'string')
  return paths.length > 0 ? paths : undefined
}

function readFileByteSizes(obj: Record<string, unknown>): number[] | undefined {
  const raw = obj.fileByteSizes ?? obj.file_byte_sizes
  if (!Array.isArray(raw)) {
    return undefined
  }
  const nums = raw
    .map((x) => {
      if (typeof x === 'number' && Number.isFinite(x)) {
        return x
      }
      if (typeof x === 'string' && x.trim()) {
        const n = Number(x)
        return Number.isFinite(n) ? n : null
      }
      return null
    })
    .filter((x): x is number => x !== null)
  return nums.length > 0 ? nums : undefined
}

function readDimension(obj: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const raw = obj[camel] ?? obj[snake]
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      return n
    }
  }
  return undefined
}

function readOptionalNumber(obj: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const raw = obj[camel] ?? obj[snake]
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw
  }
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) {
      return n
    }
  }
  return undefined
}

function readOptionalString(obj: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const raw = obj[camel] ?? obj[snake]
  if (typeof raw !== 'string') {
    return undefined
  }
  const value = raw.trim()
  return value ? value : undefined
}

/** 导入时去掉大图 RGBA，避免拖垮内存；缩略图可在后续复制时重新生成。 */
function stripImportedImageRgba(item: ClipboardItem): ClipboardItem {
  if (item.type !== 'image') {
    return item
  }
  return { ...item, imageRgba: undefined }
}

function normalizeImportItem(raw: unknown): ClipboardItem | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  if (!isClipboardType(o.type)) {
    return null
  }
  const content = typeof o.content === 'string' ? o.content : ''
  const timestamp = readTimestamp(o.timestamp)
  const idRaw = typeof o.id === 'string' ? o.id : ''
  const sourceRaw = o.sourceApp ?? o.source_app
  const sourceApp = typeof sourceRaw === 'string' && sourceRaw.trim() ? sourceRaw.trim() : undefined
  const pathRaw = o.sourceAppPath ?? o.source_app_path
  const sourceAppPath =
    typeof pathRaw === 'string' && pathRaw.trim() ? pathRaw.trim() : undefined
  const favRaw = o.favorited ?? o.favourite
  const favorited = favRaw === true || favRaw === 1 || favRaw === '1' || favRaw === 'true'
  const base: ClipboardItem = {
    id: idRaw,
    type: o.type,
    content,
    contentHash: readOptionalString(o, 'contentHash', 'content_hash'),
    imageByteSize: readOptionalNumber(o, 'imageByteSize', 'image_byte_size'),
    timestamp,
    filePaths: readFilePaths(o),
    fileByteSizes: readFileByteSizes(o),
    imageWidth: readDimension(o, 'imageWidth', 'image_width'),
    imageHeight: readDimension(o, 'imageHeight', 'image_height'),
    ...(sourceApp ? { sourceApp } : {}),
    ...(sourceAppPath ? { sourceAppPath } : {}),
    ...(favorited ? { favorited: true } : {}),
  }
  const withId = ensureClipboardItemHasUuid(base)
  return stripImportedImageRgba(withId)
}

export function parseClipboardHistoryImportJson(text: string): ClipboardItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('文件不是合法的 JSON。')
  }
  const arr = extractHistoryArray(parsed)
  const items: ClipboardItem[] = []
  for (const raw of arr) {
    const item = normalizeImportItem(raw)
    if (item) {
      items.push(item)
    }
  }
  if (items.length === 0) {
    return []
  }
  return normalizeSyncMergedHistory(items)
}
