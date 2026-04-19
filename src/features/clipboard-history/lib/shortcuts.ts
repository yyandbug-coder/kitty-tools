import { formatShortcutForDisplay } from '@/shared/lib/shortcuts'

export const DEFAULT_GLOBAL_SHORTCUT = 'CommandOrControl+Shift+V'

const MODIFIER_KEYS = new Set([
  'Meta',
  'Control',
  'Shift',
  'Alt',
])

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (event.repeat) {
    return null
  }

  if (MODIFIER_KEYS.has(event.key)) {
    return null
  }

  const mainKey = normalizeShortcutKey(event)
  if (!mainKey) {
    return null
  }

  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl')
  }
  if (event.altKey) {
    parts.push('Alt')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }

  if (parts.length === 0) {
    return null
  }

  parts.push(mainKey)
  return parts.join('+')
}

export { formatShortcutForDisplay }

function normalizeShortcutKey(event: KeyboardEvent) {
  if (/^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3)
  }

  if (/^Digit[0-9]$/.test(event.code)) {
    return event.code.slice(5)
  }

  if (/^F[1-9][0-2]?$/.test(event.key)) {
    return event.key.toUpperCase()
  }

  const namedKeyMap: Record<string, string> = {
    ' ': 'Space',
    Spacebar: 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Escape: 'Esc',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  }

  return namedKeyMap[event.key] ?? null
}
