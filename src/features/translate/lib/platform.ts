/** 是否在 Mac 上运行（用于 Tauri WebView 内展示快捷键文案） */
export function isMacOs(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    navigator.platform.toLowerCase().includes('mac') ||
    /Mac OS X|Macintosh/.test(navigator.userAgent)
  )
}

/** 主窗口内「提交翻译」组合键的展示文案 */
export function translateSubmitShortcutLabel(): string {
  return isMacOs() ? `${'\u2318'}+Enter` : 'Ctrl+Enter'
}

/**
 * 将保存的 global-hotkey 字符串格式化为界面展示（与平台修饰键习惯一致）。
 */
export function formatShortcutForDisplay(shortcut: string): string {
  const raw = shortcut.trim()
  if (!raw) return '—'
  const mac = isMacOs()
  const cmd = '\u2318'
  return raw
    .split('+')
    .map((segment) => {
      const s = segment.trim()
      switch (s) {
        case 'CmdOrCtrl':
          return mac ? cmd : 'Ctrl'
        case 'Super':
          return mac ? cmd : 'Win'
        case 'Control':
          return 'Ctrl'
        default:
          return s
      }
    })
    .join(mac ? ' + ' : ' + ')
}
