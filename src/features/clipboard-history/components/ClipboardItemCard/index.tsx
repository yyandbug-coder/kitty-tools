/**
 * 剪贴板条目卡片 - 列表中的单个历史记录项
 * 显示条目类型图标、内容摘要、收藏标记与时间戳；右键菜单可收藏/取消收藏或删除
 * 使用 React.memo 避免未选中项在 selectedIndex 变化时重渲染
 */
import dayjs from 'dayjs'
import { memo, useEffect, useRef } from 'react'
import { Star } from 'lucide-react'
import { ClipboardItem } from '@clipboard/types'
import FileTypeIcon from '@clipboard/components/FileTypeIcon'
import SourceAppIcon from '@clipboard/components/SourceAppIcon'
import SvgIcon from '@clipboard/components/SvgIcon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@clipboard/components/ui/context-menu'
import { formatFileSize, sumFileByteSizes } from '@clipboard/lib/format-bytes'
import { cn } from '@clipboard/lib/utils'

const LIST_TEXT_PREVIEW_MAX_CHARS = 120

interface Props {
  item: ClipboardItem
  index: number
  isSelected: boolean
  onSelect: (index: number) => void
  onAction: (item: ClipboardItem) => void
  onToggleFavorite: (id: string) => void
  onRemoveItem: (id: string) => void
  /** 为 false 时不在选中时 scrollIntoView（虚拟列表由 scrollToIndex 控制可见性） */
  enableAutoScroll?: boolean
}

export default memo(function ClipboardItemCard({
  item,
  index,
  isSelected,
  onSelect,
  onAction,
  onToggleFavorite,
  onRemoveItem,
  enableAutoScroll = true
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enableAutoScroll) return
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' })
    }
  }, [enableAutoScroll, isSelected])

  const primaryFilePath = item.filePaths?.[0]
  const fileName = primaryFilePath?.split(/[/\\]/).pop() ?? item.content
  const fileBytesTotal = item.type === 'file' ? sumFileByteSizes(item.fileByteSizes) : undefined
  const fileDescription =
    item.filePaths && item.filePaths.length > 1
      ? `${fileName} 等 ${item.filePaths.length} 项`
      : (primaryFilePath ?? item.content)
  const fileSecondary =
    fileBytesTotal !== undefined ? `${fileDescription} · ${formatFileSize(fileBytesTotal)}` : fileDescription
  const rawText = item.type === 'text' ? item.content : item.content || fileName
  const primaryText =
    rawText.length > LIST_TEXT_PREVIEW_MAX_CHARS ? rawText.slice(0, LIST_TEXT_PREVIEW_MAX_CHARS) : rawText
  const imageMeta = formatImageMeta(item)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={ref}
          onClick={() => onSelect(index)}
          onDoubleClick={() => onAction(item)}
          className={cn(
            'relative border border-transparent bg-[color-mix(in_oklch,var(--card)_20%,transparent)] transition-[background-color,border-color,box-shadow,transform] duration-[160ms] ease-out hover:bg-[color-mix(in_oklch,var(--theme-accent,var(--ring))_36%,transparent)]',
            'grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_max-content] items-center gap-2.5 rounded-[18px] px-3 py-1',
            isSelected &&
              "bg-[color-mix(in_oklch,var(--primary)_16%,var(--card)_84%)] border-[color-mix(in_oklch,var(--primary)_52%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_20%,transparent),inset_0_1px_0_color-mix(in_oklch,white_26%,transparent)] before:pointer-events-none before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[3px] before:rounded-full before:bg-[color-mix(in_oklch,var(--primary)_86%,white_14%)] before:[content:'']",
          )}
        >
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
              'flex size-10 shrink-0 items-center justify-center rounded-[14px]',
            )}
          >
            {item.type === 'text' ? (
              <SvgIcon name="txt" className="h-8 w-8 p-1.5 text-[#9dc8ff]" title="文本" />
            ) : item.type === 'image' ? (
              <SvgIcon name="image" className="h-8 w-8 p-1.5 text-[#9ef3ca]" title="图片" />
            ) : (
              <FileTypeIcon paths={item.filePaths} className="h-8 w-8 p-1.5" title={fileName} />
            )}
          </div>

          <div className="min-w-0 self-center">
            {item.type === 'text' && (
              <p className="line-clamp-2 wrap-break-word text-[14px] font-medium leading-5 text-foreground">
                {primaryText}
              </p>
            )}
            {item.type === 'image' && (
              <p className="line-clamp-1 text-[14px] font-medium leading-5 text-foreground">
                图片
                {imageMeta ? (
                  <span
                    className={cn(
                      isSelected
                        ? 'text-[color-mix(in_oklch,var(--foreground)_68%,var(--primary)_32%)]'
                        : 'text-muted-foreground',
                      'font-normal',
                    )}
                  >
                    {' '}
                    · {imageMeta}
                  </span>
                ) : null}
              </p>
            )}
            {item.type === 'file' && (
              <div className="flex min-w-0 flex-col gap-0">
                <p className="line-clamp-1 wrap-break-word text-[14px] font-medium leading-5 text-foreground">
                  {primaryText}
                </p>
                <p
                  className={cn(
                    isSelected
                      ? 'text-[color-mix(in_oklch,var(--foreground)_68%,var(--primary)_32%)]'
                      : 'text-muted-foreground',
                    'line-clamp-1 text-[11px] leading-4',
                  )}
                  title={fileSecondary}
                >
                  {fileSecondary}
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 text-right">
            <div className="flex items-center justify-end gap-1" title={item.favorited ? '已收藏' : undefined}>
              {item.favorited ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" aria-hidden /> : null}
              <span
                className={cn(
                  isSelected
                    ? 'text-[color-mix(in_oklch,var(--foreground)_68%,var(--primary)_32%)]'
                    : 'text-muted-foreground',
                  'pb-1 text-xs tabular-nums leading-none',
                )}
              >
                {formatTime(item.timestamp)}
              </span>
            </div>
            {item.sourceApp || item.sourceAppPath ? (
              <span
                className={cn(
                  isSelected
                    ? 'text-[color-mix(in_oklch,var(--foreground)_68%,var(--primary)_32%)]'
                    : 'text-muted-foreground',
                  'flex w-full max-w-full items-center justify-end gap-2 text-xs leading-3',
                )}
              >
                <SourceAppIcon
                  path={item.sourceAppPath}
                  title={item.sourceApp ? `来自 ${item.sourceApp}` : item.sourceAppPath}
                  sizePx={18}
                  className="opacity-90"
                />
                {item.sourceApp ? (
                  <span className="min-w-0 wrap-anywhere text-right " title={`来自 ${item.sourceApp}`}>
                    {item.sourceApp}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => onToggleFavorite(item.id)}>
          {item.favorited ? '取消收藏' : '收藏此条'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => onRemoveItem(item.id)}
        >
          删除此条
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

function formatTime(ts: number): string {
  return dayjs(ts).format('MM/DD HH:mm')
}

function formatImageMeta(item: ClipboardItem) {
  const resolution =
    item.imageWidth && item.imageHeight
      ? `${item.imageWidth}×${item.imageHeight}`
      : item.content.replace(/^图片\s*/u, '').trim() || '未知尺寸'
  const size =
    typeof item.imageByteSize === 'number' && item.imageByteSize > 0 ? ` · ${formatFileSize(item.imageByteSize)}` : ''
  return `${resolution}${size}`
}
