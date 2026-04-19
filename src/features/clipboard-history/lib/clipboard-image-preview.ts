/**
 * 剪贴板图片预览管理
 * 列表与持久化不保留 imageRgba；预览通过 Rust 生成缩略图文件，再以 convertFileSrc 加载
 */
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { ClipboardItem } from '@clipboard/types'

const MAX_PREVIEW_EDGE = 420
const NOT_AVAILABLE = '\x00__NOT_AVAILABLE__'

const previewUrlCache = new Map<string, string>()
const previewPromiseCache = new Map<string, Promise<string | null>>()

function isRealUrl(value: string | undefined): value is string {
  return !!value && value !== NOT_AVAILABLE
}

async function fetchPreviewAssetUrlFromRust(id: string): Promise<string | null> {
  try {
    const path = await invoke<string | null>('clipboard_get_image_preview_asset_path', { id, maxEdge: MAX_PREVIEW_EDGE })
    return path ? convertFileSrc(path) : null
  } catch {
    return null
  }
}

async function resolvePreviewUrl(item: ClipboardItem): Promise<string | null> {
  if (item.type !== 'image' || !item.id) return null

  const cached = previewUrlCache.get(item.id)
  if (cached !== undefined) {
    return isRealUrl(cached) ? cached : null
  }

  return fetchPreviewAssetUrlFromRust(item.id)
}

export function peekClipboardImagePreviewUrl(id?: string): string | null {
  if (!id) return null
  const cached = previewUrlCache.get(id)
  return isRealUrl(cached) ? cached : null
}

export function warmClipboardImagePreview(item: ClipboardItem): Promise<string | null> {
  if (item.type !== 'image' || !item.id) return Promise.resolve(null)

  const cached = previewUrlCache.get(item.id)
  if (cached !== undefined) {
    return Promise.resolve(isRealUrl(cached) ? cached : null)
  }

  const pending = previewPromiseCache.get(item.id)
  if (pending) {
    return pending
  }

  const promise = resolvePreviewUrl(item)
    .then((url) => {
      previewUrlCache.set(item.id, url ?? NOT_AVAILABLE)
      return url
    })
    .finally(() => {
      previewPromiseCache.delete(item.id)
    })

  previewPromiseCache.set(item.id, promise)
  return promise
}

export function clearClipboardImagePreviewCache() {
  previewPromiseCache.clear()
  for (const url of previewUrlCache.values()) {
    if (isRealUrl(url) && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  previewUrlCache.clear()
}

export function pruneClipboardImagePreviewCache(validIds: string[]) {
  const validIdSet = new Set(validIds)
  for (const [id, url] of previewUrlCache.entries()) {
    if (validIdSet.has(id)) continue
    if (isRealUrl(url) && url.startsWith('blob:')) URL.revokeObjectURL(url)
    previewUrlCache.delete(id)
    previewPromiseCache.delete(id)
  }
}
