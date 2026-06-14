// 截图区域选择组件 - 全屏透明覆盖层，拖拽框选区域后回调后端
// 窗口级事件监听，选区过小自动取消
import { useRef, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import toast from 'react-hot-toast'
import { Kbd } from '@/components/ui/kbd'

const MIN_SIZE = 8
const DIM_COLOR = 'rgba(0,0,0,0.45)'

type Point = { x: number; y: number }
type Rect = { left: number; top: number; w: number; h: number }

function normalizeRect(start: Point, cur: Point): Rect {
  const left = Math.round(Math.min(start.x, cur.x))
  const top = Math.round(Math.min(start.y, cur.y))
  const w = Math.round(Math.abs(cur.x - start.x))
  const h = Math.round(Math.abs(cur.y - start.y))
  return { left, top, w, h }
}

function clampRect(rect: Rect, vw: number, vh: number): Rect {
  const left = Math.max(0, Math.min(rect.left, vw - 1))
  const top = Math.max(0, Math.min(rect.top, vh - 1))
  const w = Math.max(1, Math.min(rect.w, vw - left))
  const h = Math.max(1, Math.min(rect.h, vh - top))
  return { left, top, w, h }
}

/** 单块遮罩 + evenodd 挖洞；外框与内洞必须各自闭合，否则 (0,vh)→(left,top) 会画出左侧三角 */
function buildDimClipPath(vw: number, vh: number, rect: Rect): string {
  const { left, top, w, h } = clampRect(rect, vw, vh)
  const right = left + w
  const bottom = top + h
  return [
    'polygon(evenodd,',
    // 外框顺时针，末尾回到起点以闭合
    `0px 0px, ${vw}px 0px, ${vw}px ${vh}px, 0px ${vh}px, 0px 0px,`,
    // 内洞逆时针，与外框绕序相反
    `${left}px ${top}px,`,
    `${right}px ${top}px,`,
    `${right}px ${bottom}px,`,
    `${left}px ${bottom}px,`,
    `${left}px ${top}px)`,
  ].join(' ')
}

export default function RegionSelect() {
  const rootRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<Point | null>(null)
  const currentRef = useRef<Point>({ x: 0, y: 0 })
  const draggingRef = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  const rafPendingRef = useRef(false)
  const rafRef = useRef<number>(0)

  const dimRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  const hideVisuals = useCallback(() => {
    const dim = dimRef.current
    if (dim) {
      dim.style.opacity = '0'
      dim.style.clipPath = 'none'
    }
    const sel = selectionRef.current
    if (sel) sel.style.visibility = 'hidden'
    const label = labelRef.current
    if (label) label.style.visibility = 'hidden'
  }, [])

  const resetInteraction = useCallback(() => {
    draggingRef.current = false
    startRef.current = null
    activePointerRef.current = null
    cancelAnimationFrame(rafRef.current)
    rafPendingRef.current = false
    hideVisuals()
  }, [hideVisuals])

  const releasePointerCapture = useCallback(() => {
    const pointerId = activePointerRef.current
    const root = rootRef.current
    if (pointerId == null || !root) return
    if (root.hasPointerCapture(pointerId)) {
      root.releasePointerCapture(pointerId)
    }
    activePointerRef.current = null
  }, [])

  const updateVisuals = useCallback((start: Point, cur: Point) => {
    const rect = normalizeRect(start, cur)
    const vw = Math.round(window.innerWidth)
    const vh = Math.round(window.innerHeight)
    const clamped = clampRect(rect, vw, vh)
    const showDetails = rect.w > 0 || rect.h > 0

    const dim = dimRef.current
    if (dim) {
      dim.style.opacity = '1'
      dim.style.clipPath = buildDimClipPath(vw, vh, rect)
    }

    const sel = selectionRef.current
    if (sel) {
      sel.style.visibility = showDetails ? 'visible' : 'hidden'
      if (showDetails) {
        sel.style.transform = `translate(${clamped.left}px, ${clamped.top}px)`
        sel.style.width = `${clamped.w}px`
        sel.style.height = `${clamped.h}px`
      }
    }

    const label = labelRef.current
    if (label) {
      label.style.visibility = showDetails ? 'visible' : 'hidden'
      if (showDetails) {
        label.style.transform = `translate(${clamped.left}px, ${Math.max(clamped.top - 24, 4)}px)`
        label.textContent = `${rect.w} × ${rect.h}`
      }
    }
  }, [])

  const scheduleVisualUpdate = useCallback(() => {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    rafRef.current = requestAnimationFrame(() => {
      rafPendingRef.current = false
      const start = startRef.current
      if (!start || !draggingRef.current) return
      updateVisuals(start, currentRef.current)
    })
  }, [updateVisuals])

  const cancelSelection = useCallback(() => {
    resetInteraction()
    releasePointerCapture()
    void invoke('region_overlay_cancel').catch(() => window.close())
  }, [releasePointerCapture, resetInteraction])

  const finish = useCallback(
    (end: Point) => {
      draggingRef.current = false
      cancelAnimationFrame(rafRef.current)
      rafPendingRef.current = false
      hideVisuals()
      releasePointerCapture()

      const start = startRef.current
      if (!start) return
      startRef.current = null

      const rect = normalizeRect(start, end)

      if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
        void invoke('region_overlay_cancel').catch(() => window.close())
        return
      }

      void invoke('region_overlay_complete', {
        x: rect.left,
        y: rect.top,
        width: rect.w,
        height: rect.h,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      }).catch(() => window.close())
    },
    [hideVisuals, releasePointerCapture],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelSelection()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelSelection])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resetInteraction()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [resetInteraction])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen<{ error?: string }>('region-capture-failed', (event) => {
      resetInteraction()
      toast.error(event.payload?.error ?? '截屏失败，请重试', { duration: 4000 })
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [resetInteraction])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      currentRef.current = { x: e.clientX, y: e.clientY }
      scheduleVisualUpdate()
    }

    const onPointerUp = (e: PointerEvent) => {
      if (!draggingRef.current || e.button !== 0) return
      finish({ x: e.clientX, y: e.clientY })
    }

    const onPointerCancel = () => {
      if (!draggingRef.current) return
      cancelSelection()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [cancelSelection, finish, scheduleVisualUpdate])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    activePointerRef.current = e.pointerId
    startRef.current = { x: e.clientX, y: e.clientY }
    currentRef.current = { x: e.clientX, y: e.clientY }
    draggingRef.current = true
    scheduleVisualUpdate()
  }

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 select-none cursor-crosshair touch-none"
      style={{ background: 'transparent' }}
      onPointerDown={handlePointerDown}
    >
      <div
        ref={dimRef}
        className="pointer-events-none fixed inset-0"
        style={{
          background: DIM_COLOR,
          opacity: 0,
          willChange: 'clip-path',
        }}
      />
      <div
        ref={selectionRef}
        className="pointer-events-none absolute left-0 top-0 border-2 border-dashed border-white"
        style={{ visibility: 'hidden', willChange: 'transform, width, height' }}
      />
      <div
        ref={labelRef}
        className="pointer-events-none absolute left-0 top-0 flex items-center justify-center rounded bg-black/70 px-2 py-0.5 text-xs font-mono text-white"
        style={{ visibility: 'hidden', willChange: 'transform' }}
      />
      <p className="pointer-events-none fixed bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-1 gap-y-1 rounded-md bg-black/75 px-3 py-1.5 text-sm text-white shadow-lg">
        <span>按住拖动框选区域</span>
        <span aria-hidden>·</span>
        <Kbd className="border-white/25 bg-white/15 text-white select-none">Esc</Kbd>
        <span>取消</span>
        <span aria-hidden>·</span>
        <span>选区过小将自动取消</span>
      </p>
    </div>
  )
}
