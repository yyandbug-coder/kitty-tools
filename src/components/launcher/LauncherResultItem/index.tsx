/**
 * 启动器结果列表单行：可选系统应用图标 + 主标题、副标题；悬停/选中时整行可点以执行。
 */
import {
  AppWindow,
  ClipboardList,
  FolderOpen,
  Globe,
  Languages,
  Settings,
} from 'lucide-react'
import type { LauncherItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatListQuickSlotShortcut } from '@/lib/platform'
import SourceAppIcon from '@/components/clipboard/SourceAppIcon'
import ShortcutKbd from '@/components/shared/ShortcutKbd'

export interface LauncherResultItemProps {
  item: LauncherItem
  id?: string
  /** 在列表中的从 0 开始的序号；前 9 项右侧展示 ⌘/Ctrl+数字 */
  listIndex: number
  selected: boolean
  onMouseEnter: () => void
  onActivate: () => void
}

const PLACEHOLDER_CLS =
  'size-7 shrink-0 text-muted-foreground opacity-90 sm:size-8'

function launcherKindPlaceholder(item: LauncherItem) {
  const { kind, payload } = item
  if (kind === 'action') {
    if (payload === 'settings') return <Settings className={PLACEHOLDER_CLS} aria-hidden />
    if (payload === 'translate_workspace') return <Languages className={PLACEHOLDER_CLS} aria-hidden />
    if (payload === 'clipboard') return <ClipboardList className={PLACEHOLDER_CLS} aria-hidden />
    return <AppWindow className={PLACEHOLDER_CLS} aria-hidden />
  }
  if (kind === 'open_url') return <Globe className={PLACEHOLDER_CLS} aria-hidden />
  if (kind === 'open_path' || kind === 'win_shell' || kind === 'mac_open') {
    return <FolderOpen className={PLACEHOLDER_CLS} aria-hidden />
  }
  return <AppWindow className={PLACEHOLDER_CLS} aria-hidden />
}

export default function LauncherResultItem({
  item,
  id,
  listIndex,
  selected,
  onMouseEnter,
  onActivate,
}: LauncherResultItemProps) {
  const path = item.iconPath?.trim() ?? ''
  const showShortcut = listIndex >= 0 && listIndex < 9

  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        'box-border flex w-full min-w-0 max-w-full items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-1.5 text-start',
        'transition-[background-color,border-color,box-shadow,color] duration-150 select-none',
        'border-transparent bg-transparent',
        'hover:bg-muted/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:outline-none',
        'dark:hover:bg-muted/40',
        'min-h-9 items-center sm:min-h-10',
        selected &&
          cn(
            'border-primary/55 bg-primary/16 text-foreground shadow-[inset_4px_0_0_0_hsl(var(--primary))]',
            'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
            'hover:bg-primary/20 dark:bg-primary/22 dark:hover:bg-primary/26',
          ),
      )}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
    >
      <span className="flex shrink-0 items-center justify-center self-center" aria-hidden>
        {path ? (
          <SourceAppIcon path={path} title={item.title} sizePx={28} className="rounded-md" />
        ) : (
          launcherKindPlaceholder(item)
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="block w-full min-w-0 max-w-full truncate text-sm font-semibold leading-tight"
          title={item.title}
        >
          {item.title}
        </span>
        <span
          className={cn(
            'block w-full min-w-0 max-w-full truncate text-[11px] leading-snug sm:text-xs',
            selected ? 'text-foreground/75' : 'text-muted-foreground',
          )}
          title={item.subtitle}
        >
          {item.subtitle}
        </span>
      </span>
      {showShortcut ? (
        <span className="inline-flex shrink-0" aria-hidden>
          <ShortcutKbd
            formatted={formatListQuickSlotShortcut(listIndex + 1)}
            emptyMessage={null}
            className={cn(
              'pointer-events-none tabular-nums',
              'h-4 min-h-4 px-1 text-[10px] font-semibold tracking-tight sm:h-[18px] sm:text-[11px]',
              selected ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </span>
      ) : null}
    </button>
  )
}
