/**
 * 历史条数上限与保留天数：与设置面板、持久化 sanitize 共用
 * - historyMaxItems：0 表示不限制条数
 * - historyRetentionDays：0 表示永久保留（不过期）
 */
import type { ClipboardItem } from '@clipboard/types'

export const HISTORY_MAX_ITEM_OPTIONS = [50, 100, 150, 200, 300, 500] as const
type HistoryMaxItemsPreset = 0 | (typeof HISTORY_MAX_ITEM_OPTIONS)[number]

export const HISTORY_RETENTION_DAY_OPTIONS = [3, 7, 14] as const
type HistoryRetentionDaysPreset = 0 | (typeof HISTORY_RETENTION_DAY_OPTIONS)[number]

const VALID_MAX = new Set<number>([0, ...HISTORY_MAX_ITEM_OPTIONS])
const VALID_RETENTION = new Set<number>([0, ...HISTORY_RETENTION_DAY_OPTIONS])

/**
 * 按条数上限截断剪贴板历史：已收藏条目始终保留（总数可超过 maxItems）；
 * 未满上限时再用未收藏条目从新到旧填满剩余名额，并保持原列表顺序。
 */
export function applyClipboardHistoryMaxSlice(items: ClipboardItem[], maxItems: number): ClipboardItem[] {
  if (maxItems <= 0) {
    return items
  }
  const favoritedCount = items.reduce((n, item) => n + (item.favorited ? 1 : 0), 0)
  const slotsForNonFavorited = Math.max(0, maxItems - favoritedCount)
  const keptNonFavoritedIds = new Set(
    items
      .filter((item) => !item.favorited)
      .slice(0, slotsForNonFavorited)
      .map((item) => item.id),
  )
  return items.filter((item) => item.favorited || keptNonFavoritedIds.has(item.id))
}

export function sanitizeHistoryMaxItems(value: unknown, fallback: number): HistoryMaxItemsPreset {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const v = Math.floor(value)
    if (VALID_MAX.has(v)) {
      return v as HistoryMaxItemsPreset
    }
  }
  if (typeof fallback === 'number' && VALID_MAX.has(fallback)) {
    return fallback as HistoryMaxItemsPreset
  }
  return 100
}

export function sanitizeHistoryRetentionDays(value: unknown, fallback: number): HistoryRetentionDaysPreset {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const v = Math.floor(value)
    if (VALID_RETENTION.has(v)) {
      return v as HistoryRetentionDaysPreset
    }
  }
  if (typeof fallback === 'number' && VALID_RETENTION.has(fallback)) {
    return fallback as HistoryRetentionDaysPreset
  }
  return 7
}
