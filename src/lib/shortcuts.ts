export function shortcutFromKeyboardEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (parts.length === 0) return null;

  const keyMap: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Escape: 'Escape', Enter: 'Return', Backspace: 'Backspace', Tab: 'Tab',
    Delete: 'Delete',
  };

  let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  key = keyMap[key] || key;
  if (key.length === 1 && /[A-Z0-9]/.test(key)) {
    parts.push(key);
  } else if (['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
    'Space','Up','Down','Left','Right','Escape','Return','Backspace','Tab','Delete',
    'Home','End','PageUp','PageDown','Insert'].includes(key)) {
    parts.push(key);
  } else {
    return null;
  }

  return parts.join('+');
}

export function formatShortcutForDisplay(shortcut: string): string {
  if (!shortcut) return '';
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  let display = shortcut;
  if (isMac) {
    display = display.replace(/CmdOrCtrl/g, '⌘');
    display = display.replace(/CommandOrControl/g, '⌘');
    display = display.replace(/Shift/g, '⇧');
    display = display.replace(/Alt/g, '⌥');
  } else {
    display = display.replace(/CmdOrCtrl/g, 'Ctrl');
    display = display.replace(/CommandOrControl/g, 'Ctrl');
  }
  return display.replace(/\+/g, ' + ');
}
