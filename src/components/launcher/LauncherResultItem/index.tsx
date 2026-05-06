/**
 * 启动器结果列表单行：可选系统应用图标 + 主标题、副标题；悬停/选中时整行可点以执行。
 *
 * 回调按 `index` 传入，由父组件提供一份 `useCallback` 出去的稳定函数；
 * 配合末尾 `React.memo`，使选中切换时仅“上一选 / 现选”两行重渲。
 */
import { memo, useCallback } from 'react'
import { AppWindow, ClipboardList, FolderOpen, Globe, Languages, Settings } from 'lucide-react'
import type { LauncherItem } from '@/types'
import { cn } from '@/lib/utils'
import { formatListQuickSlotShortcut } from '@/lib/platform'
import SourceAppIcon from '@/components/clipboard/SourceAppIcon'
import ShortcutKbd from '@/components/shared/ShortcutKbd'

export interface LauncherResultItemProps {
  item: LauncherItem
  id?: string
  /** 在列表中的从 0 开始的序号；前 9 项右侧展示 ⌘/Ctrl+数字 */
  index: number
  selected: boolean
  onMouseEnterIndex: (index: number) => void
  onActivateIndex: (index: number) => void
}

const PLACEHOLDER_CLS = 'size-7 shrink-0 text-muted-foreground opacity-90 sm:size-8'

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

function LauncherResultItemImpl({
  item,
  id,
  index,
  selected,
  onMouseEnterIndex,
  onActivateIndex
}: LauncherResultItemProps) {
  const path = item.iconPath?.trim() ?? ''
  const showShortcut = index >= 0 && index < 9

  // 本地闭包只依赖 index + 父端稳定回调；父端提供的
  // `onMouseEnterIndex` / `onActivateIndex` 在一个启动器会话内引用不变，
  // 于是这里的 useCallback 仅随 index 变化。
  const handleMouseEnter = useCallback(() => {
    onMouseEnterIndex(index)
  }, [onMouseEnterIndex, index])
  const handleActivate = useCallback(() => {
    onActivateIndex(index)
  }, [onActivateIndex, index])

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
            'hover:bg-primary/20 dark:bg-primary/22 dark:hover:bg-primary/26'
          )
      )}
      onClick={handleActivate}
      onMouseEnter={handleMouseEnter}
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
            selected ? 'text-foreground/75' : 'text-muted-foreground'
          )}
          title={item.subtitle}
        >
          {item.subtitle}
        </span>
      </span>
      {showShortcut ? (
        <span className="inline-flex shrink-0" aria-hidden>
          <ShortcutKbd
            formatted={formatListQuickSlotShortcut(index + 1)}
            emptyMessage={null}
            className={cn(
              'pointer-events-none tabular-nums',
              'h-4 min-h-4 px-1 text-[10px] font-semibold tracking-tight sm:h-[18px] sm:text-[11px]',
              selected ? 'text-primary' : 'text-muted-foreground'
            )}
          />
        </span>
      ) : null}
    </button>
  )
}

/**
 * 默认浅比较：`item` 引用漂移（后端返回不变时父组件会现以 setItems 跳过）、
 * `selected` 变化仅在 “上一选/新选” 两行，其他行以同位 boolean=false 命中 memo 跳过。
 */
const LauncherResultItem = memo(LauncherResultItemImpl)
export default LauncherResultItem
