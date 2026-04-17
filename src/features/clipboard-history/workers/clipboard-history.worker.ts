import type { ClipboardItem } from '@clipboard/types'

type WorkerRequest =
  | {
      requestId: number
      action: 'normalize'
      payload: {
        items: ClipboardItem[]
      }
    }
  | {
      requestId: number
      action: 'serialize'
      payload: {
        items: ClipboardItem[]
        storageSchemaVersion: number
      }
    }
  | {
      requestId: number
      action: 'parseNormalize'
      payload: {
        raw: string
      }
    }

type WorkerResponse =
  | {
      requestId: number
      ok: true
      kind: 'normalize' | 'parseNormalize'
      result: ClipboardItem[]
    }
  | {
      requestId: number
      ok: true
      kind: 'serialize'
      result: string
    }
  | {
      requestId: number
      ok: false
      error: string
    }

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuidV4String(id: string | undefined): boolean {
  return typeof id === 'string' && UUID_V4_RE.test(id.trim())
}

function ensureClipboardItemHasUuid(item: ClipboardItem): ClipboardItem {
  if (isUuidV4String(item.id)) {
    return item
  }

  const newId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`

  return { ...item, id: newId }
}

function mergeClipboardItem(preferred: ClipboardItem, candidate: ClipboardItem): ClipboardItem {
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

function dedupeHistoryById(history: ClipboardItem[]): ClipboardItem[] {
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

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data

  try {
    if (request.action === 'normalize') {
      const result = dedupeHistoryById(request.payload.items.map(ensureClipboardItemHasUuid))
      const response: WorkerResponse = {
        requestId: request.requestId,
        ok: true,
        kind: 'normalize',
        result,
      }
      self.postMessage(response)
      return
    }

    if (request.action === 'serialize') {
      const { items, storageSchemaVersion } = request.payload
      const history = items.map((item) =>
        item.type === 'image' ? { ...item, imageRgba: undefined } : item,
      )
      const response: WorkerResponse = {
        requestId: request.requestId,
        ok: true,
        kind: 'serialize',
        result: JSON.stringify({
          storageSchemaVersion,
          history,
        }),
      }
      self.postMessage(response)
      return
    }

    if (request.action === 'parseNormalize') {
      const parsed = JSON.parse(request.payload.raw) as {
        storageSchemaVersion?: number
        history?: ClipboardItem[]
      }
      if (!Array.isArray(parsed.history)) {
        throw new Error('存储中缺少 history 数组')
      }
      const result = dedupeHistoryById(parsed.history.map(ensureClipboardItemHasUuid))
      const response: WorkerResponse = {
        requestId: request.requestId,
        ok: true,
        kind: 'parseNormalize',
        result,
      }
      self.postMessage(response)
      return
    }

    throw new Error('未知的 Worker 请求类型')
  } catch (error) {
    const response: WorkerResponse = {
      requestId: request.requestId,
      ok: false,
      error: error instanceof Error ? error.message : '历史数据处理失败',
    }
    self.postMessage(response)
  }
}
