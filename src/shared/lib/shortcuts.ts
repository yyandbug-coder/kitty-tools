export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  return (
    navigator.platform.toLowerCase().includes('mac') ||
    /Mac OS X|Macintosh|iPhone|iPad|iPod/.test(navigator.userAgent)
  )
}

function normalizeShortcutSegment(segment: string, isMac: boolean): string {
  const trimmed = segment.trim()

  switch (trimmed) {
    case 'CommandOrControl':
    case 'CmdOrCtrl':
    case 'Super':
    case 'Meta':
      return isMac ? '\u2318' : trimmed === 'Super' || trimmed === 'Meta' ? 'Win' : 'Ctrl'
    case 'Control':
    case 'Ctrl':
      return isMac ? '\u2303' : 'Ctrl'
    case 'Shift':
      return isMac ? '\u21E7' : 'Shift'
    case 'Alt':
    case 'Option':
      return isMac ? '\u2325' : 'Alt'
    case 'Space':
      return 'Space'
    case 'Escape':
    case 'Esc':
      return 'Esc'
    default:
      return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
  }
}

export function formatShortcutForDisplay(shortcut: string, separator = ' + '): string {
  const raw = shortcut.trim()
  if (!raw) {
    return '--'
  }

  const isMac = isMacPlatform()

  return raw
    .split('+')
    .map((segment) => normalizeShortcutSegment(segment, isMac))
    .join(separator)
}

export function formatSubmitShortcutLabel(): string {
  return isMacPlatform() ? '\u2318+Enter' : 'Ctrl+Enter'
}
