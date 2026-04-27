/**
 * 启动器结果列表单行：主标题、副标题、悬停/选中时整行可点以执行。
 */
import { cn } from '@/lib/utils'
import type { LauncherItem } from '@/types'

export interface LauncherResultItemProps {
  item: LauncherItem
  id?: string
  selected: boolean
  onMouseEnter: () => void
  onActivate: () => void
}

export default function LauncherResultItem({
  item,
  id,
  selected,
  onMouseEnter,
  onActivate,
}: LauncherResultItemProps) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        'box-border flex w-full min-w-0 max-w-full flex-col items-stretch justify-center gap-0.5 overflow-hidden rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm text-start',
        'transition-colors select-none',
        'hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        'dark:hover:bg-muted/50',
        'h-auto min-h-9 sm:min-h-10',
        selected && 'bg-accent text-accent-foreground',
      )}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
    >
      <span
        className="block w-full min-w-0 max-w-full truncate text-sm font-semibold leading-tight"
        title={item.title}
      >
        {item.title}
      </span>
      <span
        className={cn(
          'block w-full min-w-0 max-w-full truncate text-[11px] leading-snug sm:text-xs',
          selected ? 'text-accent-foreground/80' : 'text-muted-foreground',
        )}
        title={item.subtitle}
      >
        {item.subtitle}
      </span>
    </button>
  )
}
