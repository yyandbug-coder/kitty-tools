// 将 formatShortcutForDisplay 的字符串拆成多颗 shadcn Kbd 键帽展示
import { Kbd, KbdGroup } from '@/components/ui/kbd'

export interface ShortcutKbdDisplayProps {
  /** 已由 formatShortcutForDisplay 等格式化的展示串，或 null 表示未配置 */
  formatted: string | null
  /** formatted 为 null/空时显示的文案 */
  emptyLabel?: string
}

export function ShortcutKbdDisplay({ formatted, emptyLabel = '未在设置中注册' }: ShortcutKbdDisplayProps) {
  if (formatted == null || !String(formatted).trim()) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>
  }
  const parts = formatted
    .split(' + ')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return <Kbd className="text-foreground">{formatted}</Kbd>
  }
  if (parts.length === 1) {
    return <Kbd className="text-foreground">{parts[0]}</Kbd>
  }
  return (
    <KbdGroup className="text-foreground">
      {parts.map((p, i) => (
        <Kbd key={`${i}-${p}`}>{p}</Kbd>
      ))}
    </KbdGroup>
  )
}
