// 自定义颜色选择器 - 色相渐变条拖拽 + 预设色点 + 原生取色器
import { useCallback, useRef } from 'react'
import { Pipette } from 'lucide-react'
import { hslToHex, hexToHue } from '@/lib/color'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const HUE_TRACK_CLASS =
  'bg-[linear-gradient(to_right,hsl(0_85%_55%),hsl(30_85%_55%),hsl(60_85%_55%),hsl(90_85%_55%),hsl(120_85%_55%),hsl(150_85%_55%),hsl(180_85%_55%),hsl(210_85%_55%),hsl(240_85%_55%),hsl(270_85%_55%),hsl(300_85%_55%),hsl(330_85%_55%),hsl(360_85%_55%))]'

interface CustomColorPickerProps {
  value: number
  onChange: (hue: number) => void
}

export default function CustomColorPicker({ value, onChange }: CustomColorPickerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)

  const updateHueFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      const ratio = x / rect.width
      onChange(Math.round(ratio * 360))
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

  const handleNativeColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(hexToHue(e.target.value))
    },
    [onChange],
  )

  const previewColor = hslToHex(value, 0.72, 0.50)
  const thumbLeftPct = `${(value / 360) * 100}%`

  return (
    <div className="flex flex-col gap-3">
      {/* 色相预览 + 取色按钮 */}
      <div className="flex items-center gap-3">
        <div
          className="size-10 shrink-0 rounded-full border-2 border-border shadow-sm"
          style={{ backgroundColor: previewColor }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">自定义颜色</p>
          <p className="text-xs text-muted-foreground">色相: {value}°</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => colorInputRef.current?.click()}
        >
          <Pipette className="size-3.5" />
          取色
        </Button>
        <input
          ref={colorInputRef}
          type="color"
          className="sr-only"
          value={previewColor}
          onChange={handleNativeColorChange}
        />
      </div>

      {/* 色相渐变条 */}
      <div
        ref={trackRef}
        className={cn(HUE_TRACK_CLASS, 'relative h-6 cursor-crosshair rounded-full touch-none')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-[left] duration-75"
          style={{
            left: thumbLeftPct,
            backgroundColor: previewColor,
          }}
        />
      </div>

      {/* 预设色点 */}
      <div className="flex items-center justify-end gap-1">
        {[0, 30, 60, 120, 180, 210, 270, 330].map((hue) => (
          <button
            key={hue}
            type="button"
            className={cn(
              'size-4 rounded-full border border-border/30 transition-transform hover:scale-125',
              value === hue && 'scale-125 ring-1 ring-foreground/40',
            )}
            style={{ backgroundColor: hslToHex(hue, 0.72, 0.5) }}
            onClick={() => onChange(hue)}
            title={`${hue}°`}
          />
        ))}
      </div>
    </div>
  )
}
