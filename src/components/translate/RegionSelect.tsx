// 截图区域选择组件 - 全屏透明覆盖层，拖拽框选区域后回调后端
// 窗口级事件监听，选区过小自动取消
import { useRef, useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

const MIN_SIZE = 8

type Point = { x: number; y: number }

export default function RegionSelect() {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef<Point | null>(null)
  const currentRef = useRef<Point>({ x: 0, y: 0 })
  const [, forceUpdate] = useState(0)
  const overlayRef = useRef<HTMLDivElement>(null)

  const finish = useCallback((end: Point) => {
    setDragging(false)
    const start = startRef.current
    if (!start) return
    startRef.current = null
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    if (width < MIN_SIZE || height < MIN_SIZE) {
      void invoke('region_overlay_cancel')
      return
    }
    void invoke('region_overlay_complete', {
      x, y, width, height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void invoke('region_overlay_cancel')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!dragging) return

    const onMouseMove = (e: MouseEvent) => {
      currentRef.current = { x: e.clientX, y: e.clientY }
      forceUpdate((n) => n + 1)
    }
    const onMouseUp = (e: MouseEvent) => {
      finish({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, finish])

  const handleMouseDown = (e: React.MouseEvent) => {
    startRef.current = { x: e.clientX, y: e.clientY }
    currentRef.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
  }

  const start = startRef.current
  const cur = currentRef.current
  const left = start ? Math.min(start.x, cur.x) : 0
  const top_ = start ? Math.min(start.y, cur.y) : 0
  const w = start ? Math.abs(cur.x - start.x) : 0
  const h = start ? Math.abs(cur.y - start.y) : 0

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 select-none cursor-crosshair"
      style={{ background: 'transparent' }}
      onMouseDown={handleMouseDown}
    >
      {dragging && start && w > 2 && h > 2 && (
        <div
          className="absolute border-2 border-dashed border-white"
          style={{
            left,
            top: top_,
            width: w,
            height: h,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      )}
      <p className="pointer-events-none fixed bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-sm text-white shadow-lg">
        按住拖动框选区域 · Esc 取消 · 选区过小将自动取消
      </p>
    </div>
  )
}
