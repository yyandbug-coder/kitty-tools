export function isMacOs(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/** 用于界面展示与 ShortcutKbd 拆分（须含「 + 」分隔符） */
export function translateSubmitShortcutLabel(): string {
  return isMacOs() ? '⌘ + Enter' : 'Ctrl + Enter';
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
  if (!shortcut) return '';
  let display = shortcut;
  if (isMacOs()) {
    display = display.replace(/CmdOrCtrl/g, '⌘');
    display = display.replace(/CommandOrControl/g, '⌘');
    display = display.replace(/\+/g, ' + ');
  } else {
    display = display.replace(/CmdOrCtrl/g, 'Ctrl');
    display = display.replace(/CommandOrControl/g, 'Ctrl');
    display = display.replace(/\+/g, ' + ');
  }
  return display;
}
