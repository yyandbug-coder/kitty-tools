/**
 * 剪贴板预览面板 - 展示选中剪贴板条目的详细内容、类型信息和操作按钮
 * 支持文本、图片、文件三种类型的预览
 * 文本正文在预览区内按行虚拟化；文件路径过多时仍仅列出前若干条（列表未虚拟化）
 * 仅下方滚动正文区使用 select-text；顶部类型/时间/来源/粘贴按钮为 select-none
 */
import dayjs from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardItem } from '@/types'
import { Clock3Icon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FileTypeIcon from '@/components/clipboard/FileTypeIcon'
import SourceAppIcon from '@/components/clipboard/SourceAppIcon'
import SvgIcon from '@/components/shared/SvgIcon'
import VirtualTextPreview from '@/components/clipboard/VirtualTextPreview'
import { peekClipboardImagePreviewUrl, warmClipboardImagePreview } from '@/app/clipboard/lib/clipboard-image-preview'
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
      <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-[18px] p-3 select-none">
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
              'flex size-11 items-center justify-center rounded-2xl text-muted-foreground',
            )}
          >
            <CopyIcon className="size-5" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">预览区域</h3>
            <p className="text-muted-foreground text-sm leading-6">
              左侧选中一条剪贴板记录后，这里会显示完整内容、类型、时间以及可直接执行的粘贴动作。
            </p>
          </div>
        </div>

        <div
          className={cn(
            'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
            'rounded-2xl p-4',
          )}
        >
          <p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">状态</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{total}</p>
          <p className="text-muted-foreground mt-1 text-sm">当前已捕获的剪贴板条目</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px]">
      <div
        className={cn(
          'border-[color-mix(in_oklch,var(--border)_26%,transparent)]',
          'flex select-none flex-col gap-2.5 border-b px-4 py-3.5',
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
              'flex size-9 items-center justify-center rounded-xl',
            )}
          >
            {item.type === 'text' && <SvgIcon name="txt" className="size-5 text-[#9dc8ff]" title="文本" />}
            {item.type === 'image' && <SvgIcon name="image" className="size-5 text-[#9ef3ca]" title="图片" />}
            {item.type === 'file' && (
              <FileTypeIcon
                paths={item.filePaths}
                className="size-5"
                title={item.filePaths?.[0]?.split(/[/\\]/).pop() ?? item.content}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{labelForType(item.type)}</p>
            <div className="text-muted-foreground mt-1 flex min-w-0  justify-between items-center gap-2 text-[11px] leading-5">
              <span className="inline-flex shrink-0 items-center gap-1">
                <Clock3Icon className="size-3.5" />
                {formatDateTime(item.timestamp)}
              </span>
              {(item.sourceApp || item.sourceAppPath) && (
                <>
                  <span
                    aria-hidden="true"
                    className="size-1 shrink-0 rounded-full bg-[color-mix(in_oklch,var(--border)_72%,transparent)]"
                  />
                  <span
                    className="flex min-w-0 items-center gap-1.5 overflow-hidden"
                    title={item.sourceApp ? `复制自 ${item.sourceApp}` : item.sourceAppPath}
                  >
                    <SourceAppIcon path={item.sourceAppPath} sizePx={13} />
                    <span className="min-w-0 truncate">{item.sourceApp ?? item.sourceAppPath}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <Button variant="default" size="sm" className="h-9 w-full rounded-xl" onClick={onPaste} disabled={!onPaste}>
          立即粘贴
        </Button>
      </div>

      {/* 滚动容器仅包正文，便于文本虚拟列表的 scrollTop 与行测量对齐 */}
      <div
        ref={previewScrollRef}
        className="min-h-0 flex-1 select-text overflow-y-auto px-4 pb-4 pt-4 no-scrollbar contain-content"
      >
        {item.type === 'text' && (
          <div
            className={cn(
              'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
              'overflow-hidden rounded-[20px] py-3',
            )}
          >
            <VirtualTextPreview scrollParentRef={previewScrollRef} content={item.content} />
          </div>
        )}

        {item.type === 'image' && (
          <div className="flex flex-col gap-4">
            <div
              className={cn(
                'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
                'flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl p-4',
              )}
            >
              {imagePreviewSrc ? (
                <img
                  src={imagePreviewSrc}
                  alt="clipboard preview"
                  className="max-h-[220px] max-w-full rounded-xl border border-border/35 bg-background/10 object-contain"
                  draggable={false}
                  onError={() => {
                    setImagePreviewSrc(null)
                    setImagePreviewFailed(true)
                  }}
                />
              ) : (
                <div
                  className="flex min-h-[180px] w-full items-center justify-center rounded-xl border border-dashed border-border/45 bg-background/15 px-4"
                  role="img"
                  aria-label={imagePreviewFailed ? '图片预览不可用' : '图片预览加载中'}
                >
                  {imagePreviewFailed ? (
                    <span className="text-muted-foreground text-center text-xs leading-6">
                      图片预览不可用
                    </span>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative size-8">
                        <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
                      </div>
                      <span className="text-muted-foreground text-xs">图片预览加载中…</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              className={cn(
                'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
                'rounded-2xl p-4 text-xs',
              )}
            >
              {(item.content ?? '').length > 0 && (
                <p
                  className={cn(
                    'text-[color-mix(in_oklch,var(--foreground)_78%,transparent)]',
                    'max-h-40 overflow-auto leading-7 wrap-break-word',
                  )}
                >
                  {item.content}
                </p>
              )}
              {item.imageWidth && item.imageHeight && (
                <p className="text-muted-foreground mt-2">
                  原始尺寸：{item.imageWidth} × {item.imageHeight} px
                </p>
              )}
              {typeof item.imageByteSize === 'number' && item.imageByteSize > 0 && (
                <p className="text-muted-foreground mt-2 tabular-nums">
                  数据大小：{formatFileSize(item.imageByteSize)}（磁盘压缩存储，与剪贴板位图体积可能不同）
                </p>
              )}
            </div>
          </div>
        )}

        {item.type === 'file' && (
          <div className="flex flex-col gap-3">
            {fileBytesTotal !== undefined && (
              <div
                className={cn(
                  'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
                  'rounded-2xl px-4 py-3 text-xs leading-5',
                )}
              >
                <p className="text-muted-foreground text-[10px] uppercase tracking-[0.2em]">文件汇总</p>
                <p className="mt-2 text-sm font-medium tabular-nums text-foreground">
                  {(item.filePaths?.length ?? 0).toLocaleString('zh-CN')} 项 · 合计 {formatFileSize(fileBytesTotal)}
                </p>
              </div>
            )}
            {filePathsOmitted > 0 && (
              <p className="text-muted-foreground rounded-xl border border-border/40 bg-background/20 px-3 py-2 text-xs leading-5">
                路径过多，预览仅列出前 {filePathsShown.length.toLocaleString('zh-CN')} 条，其余{' '}
                {filePathsOmitted.toLocaleString('zh-CN')} 条已省略。完整列表请使用「立即粘贴」。
              </p>
            )}
            {filePathsShown.map((path, idx) => {
              const byteSize = item.fileByteSizes?.[idx]
              const showSize = typeof byteSize === 'number' && byteSize > 0
              return (
                <div
                  key={path}
                  className={cn(
                    'bg-[color-mix(in_oklch,var(--card)_34%,transparent)] border border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
                    'flex items-start gap-3 rounded-xl px-3 py-3',
                  )}
                >
                  <div
                    className={cn(
                      'bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] text-[color-mix(in_oklch,var(--accent-foreground)_88%,transparent)]',
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl',
                    )}
                  >
                    <FileTypeIcon
                      paths={[path]}
                      className="h-[18px] w-[18px]"
                      title={path.split(/[/\\]/).pop() ?? path}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline justify-between gap-2">
                      <p className="min-w-0 truncate text-sm text-foreground">
                        {path.split(/[/\\]/).pop() ?? path}
                      </p>
                      {showSize ? (
                        <span className="text-muted-foreground shrink-0 tabular-nums text-[11px]" title="文件大小">
                          {formatFileSize(byteSize)}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 break-all text-xs leading-5">{path}</p>
                  </div>
                </div>
              )
            })}
            {!item.filePaths?.length && (
              <div
                className={cn(
                  'bg-[color-mix(in_oklch,var(--card)_48%,transparent)] border border-[color-mix(in_oklch,var(--border)_40%,transparent)]',
                  'rounded-xl px-3 py-2 text-sm text-muted-foreground',
                )}
              >
                暂无文件路径详情
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function labelForType(type: ClipboardItem['type']) {
  if (type === 'text') return '文本内容'
  if (type === 'image') return '图片内容'
  return '文件内容'
}

function formatDateTime(timestamp: number) {
  const d = dayjs(timestamp)
  const now = dayjs()
  if (d.year() !== now.year()) return d.format('YYYY/MM/DD HH:mm')
  return d.format('MM/DD HH:mm')
}
