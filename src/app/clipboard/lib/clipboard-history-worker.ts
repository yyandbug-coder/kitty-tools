import type { ClipboardItem } from '@/types'

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

let requestIdSeed = 0
let clipboardHistoryWorker: Worker | null = null
const pendingRequests = new Map<
  number,
  {
    resolve: (value: ClipboardItem[] | string) => void
    reject: (error: Error) => void
  }
>()

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

function normalizeClipboardHistoryFallback(items: ClipboardItem[]): ClipboardItem[] {
  return dedupeHistoryById(items.map(ensureClipboardItemHasUuid))
}

function getWorker() {
  if (clipboardHistoryWorker || typeof Worker === 'undefined') {
    return clipboardHistoryWorker
  }

  clipboardHistoryWorker = new Worker(
    new URL('./clipboard-history.worker.ts', import.meta.url),
    { type: 'module' },
  )

  clipboardHistoryWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data
    const pending = pendingRequests.get(message.requestId)
    if (!pending) return

    pendingRequests.delete(message.requestId)
    if (!message.ok) {
      pending.reject(new Error(message.error))
      return
    }

    if (message.kind === 'serialize') {
      pending.resolve(message.result)
      return
    }

    pending.resolve(message.result)
  }

  clipboardHistoryWorker.onerror = (event) => {
    const error = new Error(event.message || '历史 Worker 执行失败')
    for (const pending of pendingRequests.values()) {
      pending.reject(error)
    }
    pendingRequests.clear()
    clipboardHistoryWorker?.terminate()
    clipboardHistoryWorker = null
  }

  return clipboardHistoryWorker
}

function postWorkerRequest(message: WorkerRequest): Promise<ClipboardItem[] | string> {
  const worker = getWorker()
  if (!worker) {
    throw new Error('当前环境不支持 Worker')
  }

  return new Promise((resolve, reject) => {
    pendingRequests.set(message.requestId, { resolve, reject })
    worker.postMessage(message)
  })
}

export async function normalizeClipboardHistoryInWorker(items: ClipboardItem[]) {
  try {
    const requestId = ++requestIdSeed
    const message: WorkerRequest = {
      requestId,
      action: 'normalize',
      payload: { items },
    }
    const result = await postWorkerRequest(message)
    return result as ClipboardItem[]
  } catch {
    return normalizeClipboardHistoryFallback(items)
  }
}

export async function serializeClipboardHistoryForDbInWorker(
  items: ClipboardItem[],
  storageSchemaVersion: number,
): Promise<string> {
  const requestId = ++requestIdSeed
  const message: WorkerRequest = {
    requestId,
    action: 'serialize',
    payload: { items, storageSchemaVersion },
  }
  const result = await postWorkerRequest(message)
  return result as string
}

export async function parseNormalizeClipboardHistoryFromDbRawInWorker(raw: string): Promise<ClipboardItem[]> {
  const requestId = ++requestIdSeed
  const message: WorkerRequest = {
    requestId,
    action: 'parseNormalize',
    payload: { raw },
  }
  const result = await postWorkerRequest(message)
  return result as ClipboardItem[]
}
