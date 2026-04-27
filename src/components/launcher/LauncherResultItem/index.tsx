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
import SourceAppIcon from '@/components/clipboard/SourceAppIcon'

export interface LauncherResultItemProps {
  item: LauncherItem
  id?: string
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
  selected,
  onMouseEnter,
  onActivate,
}: LauncherResultItemProps) {
  const path = item.iconPath?.trim() ?? ''

  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      className={cn(
        'box-border flex w-full min-w-0 max-w-full items-start gap-2.5 overflow-hidden rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-start',
        'transition-colors select-none',
        'hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        'dark:hover:bg-muted/50',
        'min-h-9 sm:min-h-10',
        selected && 'bg-accent text-accent-foreground',
      )}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
    >
      <span className="mt-0.5 flex shrink-0 items-center justify-center" aria-hidden>
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
            selected ? 'text-accent-foreground/80' : 'text-muted-foreground',
          )}
          title={item.subtitle}
        >
          {item.subtitle}
        </span>
      </span>
    </button>
  )
}
