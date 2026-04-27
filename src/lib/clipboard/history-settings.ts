export const HISTORY_MAX_ITEMS_OPTIONS = [
  { label: '不限制', value: 0 },
  { label: '50 条', value: 50 },
  { label: '100 条', value: 100 },
  { label: '200 条', value: 200 },
  { label: '300 条', value: 300 },
  { label: '500 条', value: 500 },
]

export const HISTORY_RETENTION_OPTIONS = [
  { label: '永久', value: 0 },
  { label: '3 天', value: 3 },
  { label: '5 天', value: 5 },
  { label: '7 天', value: 7 },
  { label: '14 天', value: 14 },
]

export function applyClipboardHistoryMaxSlice<T extends { favorited?: boolean }>(items: T[], maxItems: number): T[] {
  if (maxItems <= 0 || items.length <= maxItems) return items
  const favorited = items.filter((i) => i.favorited)
  const nonFavorited = items.filter((i) => !i.favorited)
  const remaining = maxItems - favorited.length
  if (remaining <= 0) return favorited.slice(0, maxItems)
  return [...favorited, ...nonFavorited.slice(0, remaining)]
}
