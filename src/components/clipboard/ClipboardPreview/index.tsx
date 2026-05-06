/**
 * 剪贴板预览面板 - 展示选中剪贴板条目的详细内容、类型信息和操作按钮
 * 支持文本、图片、文件三种类型的预览
 * 文本正文在预览区内按行虚拟化；文件路径过多时仍仅列出前若干条（列表未虚拟化）
 * 仅下方滚动正文区使用 select-text；顶部类型/时间/来源/粘贴按钮为 select-none
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardItem } from '@/types'
import { Clock3Icon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FileTypeIcon from '@/components/clipboard/FileTypeIcon'
import SourceAppIcon from '@/components/clipboard/SourceAppIcon'
import SvgIcon from '@/components/shared/SvgIcon'
import VirtualTextPreview from '@/components/clipboard/VirtualTextPreview'
import { peekClipboardImagePreviewUrl, warmClipboardImagePreview } from '@/app/clipboard/lib/clipboard-image-preview'
import { formatClipboardTimeLong } from '@/app/clipboard/lib/format-clipboard-time'
import { formatFileSize, sumFileByteSizes } from '@/lib/format-bytes'
import { cn } from '@/lib/utils'

/** 文件类型最多渲染的路径行数（路径列表未做虚拟化，需控制 DOM 规模） */
const MAX_FILE_PATHS_IN_PREVIEW = 120

interface Props {
  item: ClipboardItem | null
  total: number
  onPaste?: () => void
}

export default function ClipboardPreview({ item, total, onPaste }: Props) {
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const [imagePreviewSrc, setImagePreviewSrc] = useState<string | null>(null)
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false)

  useEffect(() => {
    if (!item || item.type !== 'image' || !item.id) {
      setImagePreviewSrc(null)
      setImagePreviewFailed(false)
      return
    }

    const cached = peekClipboardImagePreviewUrl(item.id)
    if (cached) {
      setImagePreviewSrc(cached)
      setImagePreviewFailed(false)
      return
    }

    setImagePreviewSrc(null)
    setImagePreviewFailed(false)
    let cancelled = false
    void warmClipboardImagePreview(item).then((url) => {
      if (cancelled) return
      setImagePreviewSrc(url)
      setImagePreviewFailed(!url)
    })

    return () => {
      cancelled = true
    }
  }, [item])

  const { filePathsShown, filePathsOmitted } = useMemo(() => {
    if (!item || item.type !== 'file') {
      return { filePathsShown: [] as string[], filePathsOmitted: 0 }
    }
    const paths = item.filePaths ?? []
    if (paths.length <= MAX_FILE_PATHS_IN_PREVIEW) {
      return { filePathsShown: paths, filePathsOmitted: 0 }
    }
    return {
      filePathsShown: paths.slice(0, MAX_FILE_PATHS_IN_PREVIEW),
      filePathsOmitted: paths.length - MAX_FILE_PATHS_IN_PREVIEW
    }
  }, [item])

  const fileBytesTotal = useMemo(
    () => (item?.type === 'file' ? sumFileByteSizes(item.fileByteSizes) : undefined),
    [item]
  )

  if (!item) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] p-3 select-none">
        <div className="flex flex-col gap-2.5">
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
              'flex size-9 items-center justify-center rounded-xl text-muted-foreground'
            )}
          >
            <CopyIcon className="size-4" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-foreground">预览</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              在左侧选中一条记录后，此处显示全文或缩略图，并可一键粘贴。
            </p>
          </div>
        </div>
        <p className="text-muted-foreground mt-auto pt-4 text-[11px] tabular-nums leading-none">
          已捕获 <span className="font-medium text-foreground">{total}</span> 条
        </p>
      </div>
    )
  }

  const sourceTitle = item.sourceApp ? `复制自 ${item.sourceApp}` : (item.sourceAppPath ?? undefined)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px]">
      <div
        className={cn(
          'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
          'flex select-none flex-col gap-2 border-b px-3 py-2.5 sm:px-3.5'
        )}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
              'flex size-8 shrink-0 items-center justify-center rounded-lg'
            )}
          >
            {item.type === 'text' && <SvgIcon name="txt" className="size-4 text-[#9dc8ff]" title="文本" />}
            {item.type === 'image' && <SvgIcon name="image" className="size-4 text-[#9ef3ca]" title="图片" />}
            {item.type === 'file' && (
              <FileTypeIcon
                paths={item.filePaths}
                className="size-4"
                title={item.filePaths?.[0]?.split(/[/\\]/).pop() ?? item.content}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{labelForType(item.type)}</p>
            <p className="text-muted-foreground mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] leading-tight">
              <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                <Clock3Icon className="size-3 opacity-80" aria-hidden />
                {formatDateTime(item.timestamp)}
              </span>
              {(item.sourceApp || item.sourceAppPath) && (
                <>
                  <span aria-hidden className="text-border/80">
                    ·
                  </span>
                  <span className="flex min-w-0 items-center gap-1" title={sourceTitle}>
                    <SourceAppIcon path={item.sourceAppPath} sizePx={12} className="shrink-0 opacity-90" />
                    <span className="min-w-0 truncate">{item.sourceApp ?? item.sourceAppPath}</span>
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <Button
          variant="default"
          size="sm"
          className="h-8 w-full rounded-lg text-xs"
          onClick={onPaste}
          disabled={!onPaste}
        >
          粘贴到前台
        </Button>
      </div>

      {/* 滚动容器仅包正文，便于文本虚拟列表的 scrollTop 与行测量对齐 */}
      <div
        ref={previewScrollRef}
        className="min-h-0 flex-1 select-text overflow-y-auto px-3 pb-3 pt-3 sm:px-3.5 no-scrollbar contain-content"
      >
        {item.type === 'text' && (
          <div
            className={cn(
              'border border-[color-mix(in_oklch,var(--border)_35%,transparent)] bg-card/40',
              'overflow-hidden rounded-xl py-2'
            )}
          >
            <VirtualTextPreview scrollParentRef={previewScrollRef} content={item.content} />
          </div>
        )}

        {item.type === 'image' && (
          <div
            className={cn(
              'border border-[color-mix(in_oklch,var(--border)_35%,transparent)] bg-card/40',
              'flex flex-col items-center gap-2 rounded-xl p-3'
            )}
          >
            {imagePreviewSrc ? (
              <img
                src={imagePreviewSrc}
                alt="剪贴板图片预览"
                className="max-h-[min(40vh,220px)] max-w-full rounded-lg object-contain"
                draggable={false}
                onError={() => {
                  setImagePreviewSrc(null)
                  setImagePreviewFailed(true)
                }}
              />
            ) : (
              <div
                className="flex min-h-[120px] w-full items-center justify-center rounded-lg border border-dashed border-border/40 bg-muted/20 px-3"
                role="img"
                aria-label={imagePreviewFailed ? '图片预览不可用' : '图片预览加载中'}
              >
                {imagePreviewFailed ? (
                  <span className="text-muted-foreground text-center text-xs">无法预览</span>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <div className="relative size-5 shrink-0">
                      <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
                    </div>
                    加载中…
                  </div>
                )}
              </div>
            )}
            <p className="text-muted-foreground w-full text-center text-[10px] leading-snug tabular-nums">
              {item.imageWidth && item.imageHeight ? (
                <>
                  {item.imageWidth}×{item.imageHeight}
                  {typeof item.imageByteSize === 'number' && item.imageByteSize > 0
                    ? ` · ${formatFileSize(item.imageByteSize)}`
                    : ''}
                </>
              ) : (
                (item.content ?? '').replace(/^图片\s*/u, '').trim() || null
              )}
            </p>
          </div>
        )}

        {item.type === 'file' && (
          <div className="flex flex-col gap-2">
            {fileBytesTotal !== undefined && (
              <p className="text-muted-foreground text-[11px] leading-tight tabular-nums">
                {(item.filePaths?.length ?? 0).toLocaleString('zh-CN')} 个文件 · {formatFileSize(fileBytesTotal)}
              </p>
            )}
            {filePathsOmitted > 0 && (
              <p className="text-muted-foreground text-[10px] leading-snug">
                仅显示前 {filePathsShown.length} 条路径，其余 {filePathsOmitted} 条请用「粘贴到前台」获取完整列表。
              </p>
            )}
            {filePathsShown.map((path, idx) => {
              const byteSize = item.fileByteSizes?.[idx]
              const showSize = typeof byteSize === 'number' && byteSize > 0
              return (
                <div
                  key={path}
                  className="flex items-start gap-2 rounded-lg border border-border/30 bg-card/30 px-2 py-1.5"
                >
                  <FileTypeIcon
                    paths={[path]}
                    className="mt-0.5 size-4 shrink-0 opacity-90"
                    title={path.split(/[/\\]/).pop() ?? path}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-medium text-foreground">
                        {path.split(/[/\\]/).pop() ?? path}
                      </p>
                      {showSize ? (
                        <span className="text-muted-foreground shrink-0 tabular-nums text-[10px]">
                          {formatFileSize(byteSize)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 break-all text-[10px] leading-snug">{path}</p>
                  </div>
                </div>
              )
            })}
            {!item.filePaths?.length && (
              <p className="text-muted-foreground rounded-lg border border-border/30 px-2 py-1.5 text-xs">
                暂无路径信息
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function labelForType(type: ClipboardItem['type']) {
  if (type === 'text') return '文本'
  if (type === 'image') return '图片'
  return '文件'
}

function formatDateTime(timestamp: number) {
  return formatClipboardTimeLong(timestamp)
}
