/**
 * 自定义颜色选择器 - 基于色相的紧凑颜色选择器
 * 显示色相条并支持拖拽选择，用于自定义主题色调
 */
import { useCallback, useRef } from 'react'
import { hslToHex } from '@clipboard/lib/color'
import { cn } from '@clipboard/lib/utils'

const HUE_TRACK_CLASS =
  'bg-[linear-gradient(to_right,hsl(0_85%_55%),hsl(30_85%_55%),hsl(60_85%_55%),hsl(90_85%_55%),hsl(120_85%_55%),hsl(150_85%_55%),hsl(180_85%_55%),hsl(210_85%_55%),hsl(240_85%_55%),hsl(270_85%_55%),hsl(300_85%_55%),hsl(330_85%_55%),hsl(360_85%_55%))]'

interface CustomColorPickerProps {
  value: number
  onChange: (hue: number) => void
}

export default function CustomColorPicker({ value, onChange }: CustomColorPickerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updateHueFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      const ratio = x / rect.width
      const hue = Math.round(ratio * 360)
      onChange(hue)
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      updateHueFromPointer(e.clientX)
    },
    [updateHueFromPointer],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      updateHueFromPointer(e.clientX)
    },
    [updateHueFromPointer],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const previewColor = hslToHex(value, 0.72, 0.50)
  const thumbLeftPct = `${(value / 360) * 100}%`

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={trackRef}
        className={cn(HUE_TRACK_CLASS, 'relative h-6 cursor-crosshair rounded-full touch-none')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="absolute top-1/2 left-(--hue-thumb-left) h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-(--hue-preview) shadow-md transition-[left] duration-75"
          style={{
            ['--hue-thumb-left' as string]: thumbLeftPct,
            ['--hue-preview' as string]: previewColor,
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="size-5 rounded-md border border-border/40 bg-(--hue-preview)"
            style={{ ['--hue-preview' as string]: previewColor }}
          />
          <span className="text-xs text-muted-foreground">
            {value}°
          </span>
        </div>
        <div className="flex gap-1">
          {[0, 30, 60, 120, 180, 210, 270, 330].map((hue) => (
            <button
              key={hue}
              type="button"
              className={cn(
                'size-4 rounded-full border border-border/30 bg-(--hue-dot) transition-transform hover:scale-125',
                value === hue && 'scale-125 ring-1 ring-foreground/40',
              )}
              style={{ ['--hue-dot' as string]: hslToHex(hue, 0.72, 0.5) }}
              onClick={() => onChange(hue)}
              title={`${hue}°`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
