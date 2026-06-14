/**
 * JSON 编辑器分屏视图：左侧树形可编辑，右侧文本只读预览；支持拖拽调整比例，窄屏自动上下堆叠。
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Mode, type Content, type OnChangeStatus } from 'vanilla-jsoneditor'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  JSON_EDITOR_SPLIT_DEFAULT_RATIO,
  JSON_EDITOR_SPLIT_MAX_RATIO,
  JSON_EDITOR_SPLIT_MIN_RATIO,
} from '@/types/json-editor'

const LazyVanillaJsonEditor = lazy(() => import('@/components/json-editor/VanillaJsonEditor'))

interface JsonEditorSplitViewProps {
  content: Content
  isDarkMode: boolean
  onChange: (content: Content, previous: Content, status: OnChangeStatus) => void
  onError: (error: unknown) => void
}

function EditorPaneFallback() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-full w-full" />
    </div>
  )
}

export default function JsonEditorSplitView({
  content,
  isDarkMode,
  onChange,
  onError,
}: JsonEditorSplitViewProps) {
  const [splitRatio, setSplitRatio] = useState(JSON_EDITOR_SPLIT_DEFAULT_RATIO)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const clampRatio = useCallback((value: number) => {
    return Math.min(JSON_EDITOR_SPLIT_MAX_RATIO, Math.max(JSON_EDITOR_SPLIT_MIN_RATIO, value))
  }, [])

  const updateRatioFromPointer = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      const next = ((clientX - rect.left) / rect.width) * 100
      setSplitRatio(clampRatio(next))
    },
    [clampRatio]
  )

  const handleDividerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      draggingRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      updateRatioFromPointer(event.clientX)
    },
    [updateRatioFromPointer]
  )

  const handleDividerPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      updateRatioFromPointer(event.clientX)
    },
    [updateRatioFromPointer]
  )

  const handleDividerPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  useEffect(() => {
    const stopDragging = () => {
      draggingRef.current = false
    }
    window.addEventListener('pointerup', stopDragging)
    return () => window.removeEventListener('pointerup', stopDragging)
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden md:flex-row"
    >
      <section
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border/60 md:border-r md:border-b-0"
        style={{ flex: `0 0 ${splitRatio}%` }}
      >
        <div className="shrink-0 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          树形 · 编辑
        </div>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<EditorPaneFallback />}>
            <LazyVanillaJsonEditor
              className="h-full w-full"
              isDarkMode={isDarkMode}
              content={content}
              mode={Mode.tree}
              onChange={onChange}
              onError={onError}
              mainMenuBar={false}
              navigationBar
              statusBar={false}
              askToFormat={false}
            />
          </Suspense>
        </div>
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(splitRatio)}
        aria-valuemin={JSON_EDITOR_SPLIT_MIN_RATIO}
        aria-valuemax={JSON_EDITOR_SPLIT_MAX_RATIO}
        aria-label="调整分屏比例"
        className={cn(
          'relative z-10 hidden shrink-0 cursor-col-resize touch-none select-none md:block',
          'w-1.5 bg-border/60 hover:bg-primary/40 active:bg-primary/60'
        )}
        onPointerDown={handleDividerPointerDown}
        onPointerMove={handleDividerPointerMove}
        onPointerUp={handleDividerPointerUp}
        onPointerCancel={handleDividerPointerUp}
      />

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground">
          文本 · 预览
        </div>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<EditorPaneFallback />}>
            <LazyVanillaJsonEditor
              className="h-full w-full"
              isDarkMode={isDarkMode}
              content={content}
              mode={Mode.text}
              readOnly
              onError={onError}
              mainMenuBar={false}
              navigationBar={false}
              statusBar={false}
              askToFormat={false}
            />
          </Suspense>
        </div>
      </section>
    </div>
  )
}
