import type { ClipboardItem } from '@clipboard/types'

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuidV4String(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_V4_RE.test(id.trim())
}

export function ensureClipboardItemHasUuid(item: ClipboardItem): ClipboardItem {
  if (isUuidV4String(item.id)) {
    return item
  }

  const newId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return { ...item, id: newId }
}

export function mergeClipboardItem(preferred: ClipboardItem, candidate: ClipboardItem): ClipboardItem {
  return {
    ...candidate,
    ...preferred,
    contentHash: preferred.contentHash ?? candidate.contentHash,
    imageByteSize: preferred.imageByteSize ?? candidate.imageByteSize,
    fileByteSizes: preferred.fileByteSizes ?? candidate.fileByteSizes,
    filePaths: preferred.filePaths?.length ? preferred.filePaths : candidate.filePaths,
    imageRgba: preferred.imageRgba?.length ? preferred.imageRgba : candidate.imageRgba,
    imageWidth: preferred.imageWidth ?? candidate.imageWidth,
    imageHeight: preferred.imageHeight ?? candidate.imageHeight,
    sourceApp: preferred.sourceApp ?? candidate.sourceApp,
    sourceAppPath: preferred.sourceAppPath ?? candidate.sourceAppPath,
    timestamp: Math.max(preferred.timestamp, candidate.timestamp),
    favorited: Boolean(preferred.favorited || candidate.favorited),
  }
}

export function dedupeHistoryById(history: ClipboardItem[]): ClipboardItem[] {
  const byId = new Map<string, ClipboardItem>()

  for (const raw of history) {
    const item = ensureClipboardItemHasUuid(raw)
    const existing = byId.get(item.id)

    if (!existing) {
      byId.set(item.id, item)
      continue
    }

    const preferred = existing.timestamp >= item.timestamp ? existing : item
    const candidate = preferred === existing ? item : existing
    byId.set(item.id, mergeClipboardItem(preferred, candidate))
  }

  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp)
}
