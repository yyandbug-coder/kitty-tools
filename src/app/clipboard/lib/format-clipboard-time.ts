// 剪贴板时间戳格式化：本地化两份 cache（短/长），按分钟桶复用结果，避免 dayjs 反复构造。
// 长列表选中切换会让数张卡片重渲染，每帧若都走 dayjs() 会出现可观的 GC 压力。

const MINUTE_MS = 60_000
const SHORT_CACHE_LIMIT = 256
const LONG_CACHE_LIMIT = 128

const shortCache = new Map<number, string>()
const longCache = new Map<number, string>()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatShort(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatLong(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function lookupOrInsert(cache: Map<number, string>, key: number, compute: () => string, limit: number): string {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const value = compute()
  cache.set(key, value)
  if (cache.size > limit) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  return value
}

/** 列表卡片：MM/DD HH:mm */
export function formatClipboardTimeShort(ts: number): string {
  const bucket = Math.floor(ts / MINUTE_MS)
  return lookupOrInsert(shortCache, bucket, () => formatShort(ts), SHORT_CACHE_LIMIT)
}

/** 预览面板：跨年时附带年份 */
export function formatClipboardTimeLong(ts: number): string {
  const bucket = Math.floor(ts / MINUTE_MS)
  return lookupOrInsert(longCache, bucket, () => formatLong(ts), LONG_CACHE_LIMIT)
}
