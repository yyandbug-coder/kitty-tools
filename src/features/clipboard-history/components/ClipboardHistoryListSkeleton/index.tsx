/**
 * 剪贴板历史列表首屏骨架 - 在从数据库恢复历史期间占位，布局对齐 ClipboardItemCard 栅格
 */
import { Skeleton } from '@clipboard/components/ui/skeleton'
import { cn } from '@clipboard/lib/utils'

const ROW_COUNT = 8

export default function ClipboardHistoryListSkeleton() {
  return (
    <>
      {Array.from({ length: ROW_COUNT }, (_, i) => (
        <div
          key={i}
          className={cn(
            'relative border border-transparent bg-[color-mix(in_oklch,var(--card)_20%,transparent)] transition-[background-color,border-color,box-shadow,transform] duration-[160ms] ease-out hover:bg-[color-mix(in_oklch,var(--theme-accent,var(--ring))_36%,transparent)]',
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
    </>
  )
}
