/**
 * 预览面板长文本虚拟渲染 - 仅挂载可视区附近的行，避免右侧整段文本一次性进入 DOM
 * 极长且无换行的片段会按固定字符切段，仅用于拆成多个虚拟行，不是「最多展示字数」
 */
import { useLayoutEffect, useMemo, type RefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'

const LONG_LINE_CHUNK_CHARS = 8_192

function buildVirtualTextLines(content: string): string[] {
  const segments = content.split('\n')
  const lines: string[] = []
  for (const seg of segments) {
    if (seg.length <= LONG_LINE_CHUNK_CHARS) {
      lines.push(seg)
    } else {
      for (let i = 0; i < seg.length; i += LONG_LINE_CHUNK_CHARS) {
        lines.push(seg.slice(i, i + LONG_LINE_CHUNK_CHARS))
      }
    }
  }
  return lines.length > 0 ? lines : ['']
}

interface Props {
  scrollParentRef: RefObject<HTMLElement | null>
  content: string
}

export default function VirtualTextPreview({ scrollParentRef, content }: Props) {
  const lines = useMemo(() => buildVirtualTextLines(content), [content])

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 24,
    overscan: 14,
    getItemKey: (index) => index,
  })

  useLayoutEffect(() => {
    virtualizer.scrollToOffset(0)
  }, [content, virtualizer])

  const totalSize = virtualizer.getTotalSize()

  return (
    <div
      className={cn(
        'text-[color-mix(in_oklch,var(--foreground)_78%,transparent)]',
        'relative h-[var(--vt-total)] w-full font-sans text-[13px] leading-6',
      )}
      style={{ ['--vt-total' as string]: `${totalSize}px` }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div
          key={row.key}
          data-index={row.index}
          ref={virtualizer.measureElement}
          className="absolute top-0 left-0 w-full translate-y-[var(--vt-y)] px-4"
          style={{ ['--vt-y' as string]: `${row.start}px` }}
        >
          <p className="m-0 wrap-break-word whitespace-pre-wrap">{lines[row.index] ?? ''}</p>
        </div>
      ))}
    </div>
  )
}
