// 将已格式化的快捷键展示字符串拆成多颗 shadcn Kbd 键帽
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'

export interface ShortcutKbdProps {
  /** 通常为 formatShortcutForDisplay(…) 的整段结果 */
  formatted: string | null | undefined
  /**
   * formatted 为空时的展示；`null` 表示不渲染任何回退（用于始终有值的热键行可传空字符串+自定义样式在外层处理）
   * @default '未在设置中注册'
   */
  emptyMessage?: string | null
  /** 有内容时，附加在 Kbd / KbdGroup 上的类名 */
  className?: string
}

export default function ShortcutKbd({ formatted, emptyMessage = '未在设置中注册', className }: ShortcutKbdProps) {
  if (formatted == null || formatted === '') {
    if (emptyMessage === null) return null
    return <span className="text-sm text-muted-foreground">{emptyMessage}</span>
  }
  const parts = formatted
    .split(' + ')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return (
      <Kbd className={cn(className)} data-slot="shortcut-kbd">
        {formatted}
      </Kbd>
    )
  }
  if (parts.length === 1) {
    return (
      <Kbd className={cn(className)} data-slot="shortcut-kbd">
        {parts[0]}
      </Kbd>
    )
  }
  return (
    <KbdGroup className={className} data-slot="shortcut-kbd">
      {parts.map((p, i) => (
        <Kbd key={`${i}-${p}`} className={className}>
          {p}
        </Kbd>
      ))}
    </KbdGroup>
  )
}
