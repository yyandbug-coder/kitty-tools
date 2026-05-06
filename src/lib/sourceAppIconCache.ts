/**
 * 「来源应用图标」会话级缓存。
 *
 * - 容量上限 LRU：Map 的迭代顺序 ≡ 插入顺序，命中时 `delete + set` 把 key 提到末尾，
 *   抵达上限时淘汰队首；避免突发滚动洪流把热点路径挤掉。
 * - 在飞请求合并：同一路径并发请求时只发一次 IPC，由 `getOrFetchIcon` / `prefetchIcons`
 *   共享同一个 Promise。
 * - `prefetchIcons` 调后端批量命令 `get_app_icons_data_url`，把 N 次往返合并成 1 次；
 *   命中缓存或在飞中的项会被自动跳过。
 */

import { invoke } from '@tauri-apps/api/core'

const ICON_CACHE_CAP = 256

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

function rememberIconCache(key: string, value: string | null): void {
  if (cache.has(key)) {
    cache.delete(key)
  } else if (cache.size >= ICON_CACHE_CAP) {
    const oldest = cache.keys().next()
    if (!oldest.done) {
      cache.delete(oldest.value)
    }
  }
  cache.set(key, value)
}

/** 命中时把 key 提到 LRU 末尾再返回；未命中时返回 `{hit: false}`。 */
export function lookupIconCache(key: string): { hit: boolean; value: string | null } {
  if (!cache.has(key)) {
    return { hit: false, value: null }
  }
  const value = cache.get(key) ?? null
  cache.delete(key)
  cache.set(key, value)
  return { hit: true, value }
}

/** 同一路径并发请求时复用一个 Promise，避免双发 IPC。 */
export function getOrFetchIcon(rawKey: string | undefined): Promise<string | null> {
  const key = rawKey?.trim() ?? ''
  if (!key) {
    return Promise.resolve(null)
  }
  const cached = lookupIconCache(key)
  if (cached.hit) {
    return Promise.resolve(cached.value)
  }
  const existing = inflight.get(key)
  if (existing) {
    return existing
  }
  const p = invoke<string | null>('get_app_icon_data_url', { path: key })
    .then((v) => {
      const value = v ?? null
      rememberIconCache(key, value)
      return value
    })
    .catch(() => {
      rememberIconCache(key, null)
      return null
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, p)
  return p
}

/**
 * 批量预取一组图标。命中缓存、空字符串、已经在飞的路径会被跳过；剩余路径走批量
 * IPC 一次性返回。失败时退化为「整批写入 null」，保证命中率不下降。
 */
export function prefetchIcons(rawPaths: ReadonlyArray<string | undefined | null>): void {
  const seen = new Set<string>()
  const need: string[] = []
  for (const raw of rawPaths) {
    const key = raw?.trim() ?? ''
    if (!key) continue
    if (seen.has(key)) continue
    seen.add(key)
    if (cache.has(key)) continue
    if (inflight.has(key)) continue
    need.push(key)
  }
  if (need.length === 0) return

  const batch = invoke<(string | null)[]>('get_app_icons_data_url', { paths: need }).catch(
    () => need.map(() => null),
  )

  need.forEach((key, idx) => {
    const single: Promise<string | null> = batch
      .then((arr) => arr[idx] ?? null)
      .then((value) => {
        rememberIconCache(key, value)
        return value
      })
      .catch(() => {
        rememberIconCache(key, null)
        return null
      })
      .finally(() => {
        inflight.delete(key)
      })
    inflight.set(key, single)
  })
}
