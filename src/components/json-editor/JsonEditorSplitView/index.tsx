/**
 * JSON 编辑器分屏视图：左侧树形可编辑，右侧文本只读预览；支持拖拽调整比例，窄屏自动上下堆叠。
 */
import { Suspense, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Mode, type Content, type OnChangeStatus } from 'vanilla-jsoneditor'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  JSON_EDITOR_SPLIT_MAX_RATIO,
  JSON_EDITOR_SPLIT_MIN_RATIO,
} from '@/types/json-editor'

import LazyVanillaJsonEditor from '@/components/json-editor/lazyVanillaJsonEditor'

interface JsonEditorSplitViewProps {
  content: Content
  isDarkMode: boolean
  initialSplitRatio: number
  onSplitRatioChange: (ratio: number) => void
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

function clampSplitRatio(value: number): number {
  return Math.min(JSON_EDITOR_SPLIT_MAX_RATIO, Math.max(JSON_EDITOR_SPLIT_MIN_RATIO, value))
}

export default function JsonEditorSplitView({
  content,
  isDarkMode,
  initialSplitRatio,
  onSplitRatioChange,
  onChange,
  onError,
}: JsonEditorSplitViewProps) {
  const [splitRatio, setSplitRatio] = useState(initialSplitRatio)
  const containerRef = useRef<HTMLDivElement>(null)
  const dividerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const splitRatioRef = useRef(initialSplitRatio)
  const rafRef = useRef<number | null>(null)
  const onSplitRatioChangeRef = useRef(onSplitRatioChange)
  onSplitRatioChangeRef.current = onSplitRatioChange

  const setDraggingUi = useCallback((dragging: boolean) => {
    draggingRef.current = dragging
    containerRef.current?.classList.toggle('is-split-dragging', dragging)
    dividerRef.current?.classList.toggle('bg-primary/60', dragging)
  }, [])

  const applyRatioToDom = useCallback((ratio: number) => {
    containerRef.current?.style.setProperty('--split-ratio', `${ratio}%`)
    const divider = dividerRef.current
    if (divider) {
      divider.setAttribute('aria-valuenow', String(Math.round(ratio)))
    }
  }, [])

  const commitRatio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const next = splitRatioRef.current
    setSplitRatio(next)
    onSplitRatioChangeRef.current(next)
  }, [])

  useEffect(() => {
    splitRatioRef.current = initialSplitRatio
    setSplitRatio(initialSplitRatio)
    applyRatioToDom(initialSplitRatio)
  }, [applyRatioToDom, initialSplitRatio])

  const scheduleRatioFromPointer = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0) return
      splitRatioRef.current = clampSplitRatio(((clientX - rect.left) / rect.width) * 100)

      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        applyRatioToDom(splitRatioRef.current)
      })
    },
    [applyRatioToDom]
  )

  const handleDividerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      setDraggingUi(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      scheduleRatioFromPointer(event.clientX)
    },
    [scheduleRatioFromPointer, setDraggingUi]
  )

  const handleDividerPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      scheduleRatioFromPointer(event.clientX)
    },
    [scheduleRatioFromPointer]
  )

  const stopDragging = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      setDraggingUi(false)
      event.currentTarget.releasePointerCapture(event.pointerId)
      commitRatio()
    },
    [commitRatio, setDraggingUi]
  )

  useEffect(() => {
    const handleWindowPointerUp = () => {
      if (!draggingRef.current) return
      setDraggingUi(false)
      commitRatio()
    }
    window.addEventListener('pointerup', handleWindowPointerUp)
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp)
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [commitRatio, setDraggingUi])

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden md:flex-row [&.is-split-dragging]:select-none [&.is-split-dragging_.kitty-json-editor-host]:pointer-events-none"
      style={{ ['--split-ratio' as string]: `${splitRatio}%` }}
    >
      <section
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-border/60 md:border-r md:border-b-0"
        style={{ flex: '0 0 var(--split-ratio)' }}
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
        ref={dividerRef}
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
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
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
