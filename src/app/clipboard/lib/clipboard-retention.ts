// 剪贴板历史保留期：按条目的 timestamp 过滤过期记录；已收藏条目不受限制
import type { ClipboardItem } from '@/types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function filterHistoryByRetention(items: ClipboardItem[], retentionDays: number): ClipboardItem[] {
  if (retentionDays <= 0) return items
  const cutoff = Date.now() - retentionDays * MS_PER_DAY
  return items.filter((item) => item.timestamp >= cutoff || item.favorited === true)
}
