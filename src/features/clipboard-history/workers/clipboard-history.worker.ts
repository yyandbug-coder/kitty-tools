import type { ClipboardItem } from '@clipboard/types'
import {
  ensureClipboardItemHasUuid,
  dedupeHistoryById,
} from '../lib/clipboard-merge'

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
