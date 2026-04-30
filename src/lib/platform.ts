/** 启动时一次性判定，缓存避免每次调用都触碰已弃用的 navigator.platform。 */
let _isMacOsCache: boolean | null = null

interface UserAgentDataLike {
  platform?: string
}

function detectIsMacOs(): boolean {
  if (typeof navigator === 'undefined') return false
  // Chromium WebView 已上线 navigator.userAgentData，优先使用
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData
  const uaDataPlatform = uaData?.platform
  if (typeof uaDataPlatform === 'string' && uaDataPlatform.length > 0) {
    return /mac/i.test(uaDataPlatform)
  }
  // 兼容旧 webview / Safari WebKit：navigator.platform 仍可用，但已弃用
  const legacyPlatform = (navigator as Navigator & { platform?: string }).platform
  if (typeof legacyPlatform === 'string' && legacyPlatform.length > 0) {
    return legacyPlatform.toUpperCase().includes('MAC')
  }
  // 最后退化到 userAgent 串里找 Mac 关键字（macOS Tauri WebKit 与 Safari 一致）
  const ua = navigator.userAgent || ''
  return /mac/i.test(ua)
}

export function isMacOs(): boolean {
  if (_isMacOsCache === null) {
    _isMacOsCache = detectIsMacOs()
  }
  return _isMacOsCache
}

/** 用于界面展示与 ShortcutKbd 拆分（须含「 + 」分隔符） */
export function translateSubmitShortcutLabel(): string {
  return isMacOs() ? '⌘ + Enter' : 'Ctrl + Enter'
}

/**
 * 列表第 1～9 项的「修饰键 + 数字」展示（含 ` + ` 分隔），供 ShortcutKbd 拆成多颗 Kbd。
 * @param slot 1～9
 */
export function formatListQuickSlotShortcut(slot: number): string {
  const n = Math.min(Math.max(Math.floor(slot), 1), 9)
  return isMacOs() ? `⌘ + ${n}` : `Ctrl + ${n}`
}

export function formatShortcutForDisplay(shortcut: string): string {
  if (!shortcut) return ''
  let display = shortcut
  if (isMacOs()) {
    display = display.replace(/CmdOrCtrl/g, '⌘')
    display = display.replace(/CommandOrControl/g, '⌘')
    display = display.replace(/\+/g, ' + ')
  } else {
    display = display.replace(/CmdOrCtrl/g, 'Ctrl')
    display = display.replace(/CommandOrControl/g, 'Ctrl')
    display = display.replace(/\+/g, ' + ')
  }
  return display
}
