export function isMacOs(): boolean {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/** 用于界面展示与 ShortcutKbd 拆分（须含「 + 」分隔符） */
export function translateSubmitShortcutLabel(): string {
  return isMacOs() ? '⌘ + Enter' : 'Ctrl + Enter';
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
