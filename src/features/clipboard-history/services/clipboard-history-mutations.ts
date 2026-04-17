/**
 * 在独立设置窗口中修改剪贴板历史持久化，并通过事件通知主浮层重新加载
 */
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import type { AppSettings, ClipboardItem } from '@clipboard/types'
import { mergeClipboardHistoriesForSync } from '@clipboard/lib/cloud-sync'
import {
  parseNormalizeClipboardHistoryFromDbRawInWorker,
  serializeClipboardHistoryForDbInWorker,
} from '@clipboard/lib/clipboard-history-worker'
import { filterHistoryByRetention } from '@clipboard/lib/clipboard-retention'
import { applyClipboardHistoryMaxSlice } from '@clipboard/lib/history-settings'
import { loadClipboardHistoryFromDb, saveClipboardHistoryToDb } from '@clipboard/services/database'

const HISTORY_STORAGE_SCHEMA_VERSION = 1

type StoredClipboardHistory = {
  storageSchemaVersion?: number
  history?: ClipboardItem[]
}

async function parseHistoryFromDbRaw(raw: string): Promise<ClipboardItem[]> {
  try {
    return await parseNormalizeClipboardHistoryFromDbRawInWorker(raw)
  } catch {
    const parsed = JSON.parse(raw) as StoredClipboardHistory
    if (!Array.isArray(parsed.history)) {
      return []
    }
    return parsed.history
  }
}

export async function getClipboardHistoryCount(): Promise<number> {
  const raw = await loadClipboardHistoryFromDb()
  if (!raw) {
    return 0
  }
  const items = await parseHistoryFromDbRaw(raw)
  return items.length
}

export async function loadClipboardHistoryItemsForExport(): Promise<ClipboardItem[]> {
  const raw = await loadClipboardHistoryFromDb()
  if (!raw) {
    return []
  }
  return parseHistoryFromDbRaw(raw)
}

export async function clearClipboardHistoryStorage(): Promise<void> {
  const empty = JSON.stringify({
    storageSchemaVersion: HISTORY_STORAGE_SCHEMA_VERSION,
    history: [],
  } satisfies StoredClipboardHistory)
  await saveClipboardHistoryToDb(empty)
  await invoke('clipboard_prune_image_store', { keepIds: [] as string[] })
  await emit('clipboard-history-reload-from-db', {})
}

export async function mergeImportIntoClipboardHistoryStorage(
  items: ClipboardItem[],
  limits: Pick<AppSettings, 'historyMaxItems' | 'historyRetentionDays'>,
): Promise<void> {
  const raw = await loadClipboardHistoryFromDb()
  let current: ClipboardItem[] = []
  if (raw) {
    current = await parseHistoryFromDbRaw(raw)
  }
  const merged = filterHistoryByRetention(
    applyClipboardHistoryMaxSlice(mergeClipboardHistoriesForSync(current, items), limits.historyMaxItems),
    limits.historyRetentionDays,
  )
  const serialized = await serializeClipboardHistoryForDbInWorker(merged, HISTORY_STORAGE_SCHEMA_VERSION)
  await saveClipboardHistoryToDb(serialized)
  const imageIds = merged.filter((i) => i.type === 'image').map((i) => i.id)
  await invoke('clipboard_prune_image_store', { keepIds: imageIds })
  await emit('clipboard-history-reload-from-db', {})
}
