// 剪贴板图片预览管理 - 列表与持久化不保留 imageRgba；预览通过 Rust 生成缩略图文件
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import type { ClipboardItem } from '@/types'

const MAX_PREVIEW_EDGE = 420

const previewUrlCache = new Map<string, string>()
const previewPromiseCache = new Map<string, Promise<string | null>>()

async function fetchPreviewAssetUrlFromRust(id: string): Promise<string | null> {
  try {
    const path = await invoke<string | null>('get_image_preview_asset_path', { id, maxEdge: MAX_PREVIEW_EDGE })
    return path ? convertFileSrc(path) : null
  } catch {
    return null
  }
}

async function resolvePreviewUrl(item: ClipboardItem): Promise<string | null> {
  if (item.type !== 'image' || !item.id) return null

  const cached = previewUrlCache.get(item.id)
  if (cached) return cached

  return fetchPreviewAssetUrlFromRust(item.id)
}

export function peekClipboardImagePreviewUrl(id?: string) {
  if (!id) return null
  return previewUrlCache.get(id) ?? null
}

export function warmClipboardImagePreview(item: ClipboardItem) {
  if (item.type !== 'image' || !item.id) return Promise.resolve(null)

  const cached = previewUrlCache.get(item.id)
  if (cached) {
    return Promise.resolve(cached)
  }

  const pending = previewPromiseCache.get(item.id)
  if (pending) {
    return pending
  }

  const promise = resolvePreviewUrl(item)
    .then((url) => {
      if (url) previewUrlCache.set(item.id, url)
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
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  previewUrlCache.clear()
}

export function pruneClipboardImagePreviewCache(validIds: string[]) {
  const validIdSet = new Set(validIds)
  for (const [id, url] of previewUrlCache.entries()) {
    if (validIdSet.has(id)) continue
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    previewUrlCache.delete(id)
    previewPromiseCache.delete(id)
  }
}
