/**
 * 剪贴板历史列表首屏骨架 - 在从数据库恢复历史期间占位，布局对齐 ClipboardItemCard 栅格
 * 行数自适应容器高度
 */
import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const ROW_HEIGHT = 52

export default function ClipboardHistoryListSkeleton() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [rowCount, setRowCount] = useState(8)

  useEffect(() => {
    const el = containerRef.current?.parentElement
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setRowCount(Math.max(3, Math.floor(entry.contentRect.height / ROW_HEIGHT)))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef}>
      {Array.from({ length: rowCount }, (_, i) => (
        <div
          key={i}
          className={cn(
            'relative border border-transparent bg-[color-mix(in_oklch,var(--card)_20%,transparent)]',
            'pointer-events-none grid grid-cols-[auto_minmax(0,1fr)_max-content] items-center gap-2.5 rounded-[18px] px-3 py-1',
          )}
          aria-hidden
        >
          <Skeleton className="size-10 shrink-0 rounded-[14px]" />
          <div className="flex min-w-0 flex-col gap-2 self-center py-0.5">
            <Skeleton className="h-4 max-w-[280px] rounded-md" />
            <Skeleton className="h-3 w-24 max-w-full rounded-md opacity-80" />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton className="h-3 w-10 rounded" />
            <Skeleton className="h-3 w-14 rounded opacity-90" />
          </div>
        </div>
      ))}
    </div>
  )
}
