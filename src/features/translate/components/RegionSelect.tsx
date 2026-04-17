import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Point = { x: number; y: number }

const MIN_SIZE = 8

export function RegionSelect() {
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)

  const finish = useCallback(async (a: Point, b: Point) => {
    const x1 = Math.min(a.x, b.x)
    const y1 = Math.min(a.y, b.y)
    const x2 = Math.max(a.x, b.x)
    const y2 = Math.max(a.y, b.y)
    const w = x2 - x1
    const h = y2 - y1
    if (w < MIN_SIZE || h < MIN_SIZE) {
      await invoke('translate_region_overlay_cancel')
      return
    }
    await invoke('translate_region_overlay_complete', {
      x: x1,
      y: y1,
      width: w,
      height: h,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void invoke('translate_region_overlay_cancel')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!dragging || !start) return

    const onMove = (e: MouseEvent) => {
      setCurrent({ x: e.clientX, y: e.clientY })
    }

    const onUp = (e: MouseEvent) => {
      const end = { x: e.clientX, y: e.clientY }
      setDragging(false)
      setStart(null)
      setCurrent(null)
      void finish(start, end)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, start, finish])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setDragging(true)
    const p = { x: e.clientX, y: e.clientY }
    setStart(p)
    setCurrent(p)
  }

  let left = 0
  let top = 0
  let width = 0
  let height = 0
  if (start && current) {
    left = Math.min(start.x, current.x)
    top = Math.min(start.y, current.y)
    width = Math.abs(current.x - start.x)
    height = Math.abs(current.y - start.y)
  }

  return (
    <div
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ background: 'transparent' }}
      onMouseDown={onMouseDown}
    >
      {start && current && width > 0 && height > 0 ? (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-white"
          style={{
            left,
            top,
            width,
            height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
          }}
        />
      ) : null}
      <p className="pointer-events-none fixed bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-md bg-black/75 px-3 py-1.5 text-sm text-white shadow-lg">
        按住拖动框选区域 · Esc 取消 · 选区过小将自动取消
      </p>
    </div>
  )
}
