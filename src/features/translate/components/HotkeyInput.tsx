import { useCallback, useEffect, useState } from 'react'
import { Button } from '@translate/components/ui/button'
import { formatShortcutForDisplay } from '@/shared/lib/shortcuts'

/** 将 KeyboardEvent.code 转为 global-hotkey 可解析的键名 */
function physicalKeyToToken(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map: Record<string, string> = {
    Space: 'Space',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  }
  if (map[code]) return map[code]
  if (/^F\d{1,2}$/.test(code)) return code
  if (code.startsWith('Numpad')) {
    const n = code.slice(6)
    if (n >= '0' && n <= '9') return n
  }
  return code
}

function buildHotkeyFromEvent(e: KeyboardEvent): string | null {
  if (e.repeat) return null

  const modifierOnlyCodes = new Set([
    'ControlLeft',
    'ControlRight',
    'ShiftLeft',
    'ShiftRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
  ])
  if (modifierOnlyCodes.has(e.code)) return null

  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')

  if (mods.length === 0) return null

  const token = physicalKeyToToken(e.code)
  return [...mods, token].join('+')
}

export type HotkeyInputProps = {
  /** 行标题，如「划词翻译」 */
  label: string
  value: string
  defaultValue: string
  onChange: (next: string) => Promise<void>
  id?: string
  disabled?: boolean
}

export function HotkeyInput({
  label,
  value,
  defaultValue,
  onChange,
  id,
  disabled,
}: HotkeyInputProps) {
  const [recording, setRecording] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savingDefault, setSavingDefault] = useState(false)

  const stopRecording = useCallback(() => setRecording(false), [])

  useEffect(() => {
    if (!recording || disabled) return

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        stopRecording()
        return
      }
      const s = buildHotkeyFromEvent(e)
      if (!s) return
      void (async () => {
        try {
          await onChange(s)
          setErr(null)
        } catch (e) {
          setErr(typeof e === 'string' ? e : String(e))
        } finally {
          stopRecording()
        }
      })()
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, disabled, onChange, stopRecording])

  const busy = disabled || savingDefault

  return (
    <div id={id} className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatShortcutForDisplay(value)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant={recording ? 'default' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={() => {
              setErr(null)
              setRecording((v) => !v)
            }}
          >
            {recording ? '按下组合键' : '录制'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || value === defaultValue}
            onClick={() => {
              setErr(null)
              setRecording(false)
              setSavingDefault(true)
              void onChange(defaultValue)
                .catch((e) => {
                  setErr(typeof e === 'string' ? e : '恢复默认快捷键失败。')
                })
                .finally(() => {
                  setSavingDefault(false)
                })
            }}
          >
            默认
          </Button>
        </div>
      </div>
      {recording ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          按下新组合键；<kbd className="rounded border px-1">Esc</kbd> 取消。需含修饰键。
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          需同时按修饰键与字母键，例如 {formatShortcutForDisplay(defaultValue)}。
        </p>
      )}
      {err ? <p className="mt-1.5 text-xs leading-5 text-destructive">{err}</p> : null}
    </div>
  )
}
