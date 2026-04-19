import type { ClipboardItem } from '@clipboard/types'
import {
  ensureClipboardItemHasUuid,
  dedupeHistoryById,
} from './clipboard-merge'

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

let requestIdSeed = 0
let clipboardHistoryWorker: Worker | null = null
const pendingRequests = new Map<
  number,
  {
    resolve: (value: ClipboardItem[] | string) => void
    reject: (error: Error) => void
  }
>()

function normalizeClipboardHistoryFallback(items: ClipboardItem[]): ClipboardItem[] {
  return dedupeHistoryById(items.map(ensureClipboardItemHasUuid))
}

function getWorker() {
  if (clipboardHistoryWorker || typeof Worker === 'undefined') {
    return clipboardHistoryWorker
  }

  clipboardHistoryWorker = new Worker(
    new URL('../workers/clipboard-history.worker.ts', import.meta.url),
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
