import type { ClipboardItem } from '@clipboard/types'
import { normalizeClipboardHistoryInWorker } from '@clipboard/lib/clipboard-history-worker'
import {
  ensureClipboardItemHasUuid,
  mergeClipboardItem,
  dedupeHistoryById,
} from './clipboard-merge'

export { ensureClipboardItemHasUuid }

export function mergeClipboardHistoriesForSync(
  localHistory: ClipboardItem[],
  importedHistory: ClipboardItem[],
): ClipboardItem[] {
  return dedupeHistoryById([
    ...importedHistory.map(ensureClipboardItemHasUuid),
    ...localHistory.map(ensureClipboardItemHasUuid),
  ])
}

export function normalizeSyncMergedHistory(items: ClipboardItem[]): ClipboardItem[] {
  return dedupeHistoryById(items.map(ensureClipboardItemHasUuid))
}

export async function normalizeSyncMergedHistoryAsync(items: ClipboardItem[]): Promise<ClipboardItem[]> {
  return normalizeClipboardHistoryInWorker(items)
}

function getClipboardItemFingerprint(item: ClipboardItem) {
  if (item.type === 'file') {
    return `file:${(item.filePaths ?? []).join('\u001f') || item.content}`
  }

  if (item.type === 'image') {
    if (item.contentHash) return `image:${item.contentHash}`
    const dims = `${item.imageWidth ?? 0}x${item.imageHeight ?? 0}`
    const size = item.imageByteSize ?? 0
    return `image:${dims}:${size}:${item.content}`
  }

  return `text:${item.content}`
}

/**
 * 假定 prev 已按时间倒序且通常无重复指纹；将新复制项插到队首并合并同指纹旧项。热路径 O(n)，避免每次全表排序。
 */
export function prependFingerprintDedupedClipboardHistory(
  payload: ClipboardItem,
  prev: ClipboardItem[],
): ClipboardItem[] {
  const fp = getClipboardItemFingerprint(payload)
  let head = payload
  const tail: ClipboardItem[] = []
  for (const item of prev) {
    if (getClipboardItemFingerprint(item) === fp) {
      const preferred = head.timestamp >= item.timestamp ? head : item
      const candidate = preferred === head ? item : head
      head = mergeClipboardItem(preferred, candidate)
    } else {
      tail.push(item)
    }
  }
  return [head, ...tail]
}
