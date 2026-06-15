/**
 * 将 JSON 编辑器关键样式注入 document.head 末尾，确保覆盖 vanilla-jsoneditor 运行时注入的 Svelte 样式。
 */
const STYLE_ID = 'kitty-json-editor-overrides-inline'

/**
 * 仅覆盖插入线视觉：必须保持 height:0，否则会撑出空行。
 * 库默认 outline 实线 + flex:1，这里改为虚线并限制最大宽度。
 */
const CRITICAL_CSS = `
.kitty-json-editor-host .jse-json-node .jse-insert-area {
  height: 0 !important;
  min-width: 4rem !important;
  max-width: 11rem !important;
  outline: 1px dashed color-mix(in oklch, var(--border) 70%, var(--muted-foreground)) !important;
}
.kitty-json-editor-host .jse-json-node .jse-insert-area.jse-hovered {
  outline-style: solid !important;
  outline-color: color-mix(in oklch, var(--primary) 55%, var(--border)) !important;
}
`

let headObserver: MutationObserver | null = null
let watcherRefCount = 0
let injectingOverrides = false

/** 仅在元素不是 head 最后一个子节点时移动，避免 appendChild 触发 MutationObserver 死循环 */
function moveToHeadEnd(node: HTMLElement): void {
  if (document.head.lastElementChild === node) return
  document.head.appendChild(node)
}

/** 退出导航栏 JSONPath 编辑模式，恢复面包屑路径展示 */
export function closeJsonEditorPathEditor(): void {
  document
    .querySelectorAll<HTMLButtonElement>('.kitty-json-editor-host .jse-navigation-bar-edit.editing')
    .forEach((button) => {
      button.click()
    })
}

export function injectJsonEditorCriticalOverrides(): void {
  if (injectingOverrides) return
  injectingOverrides = true
  try {
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = CRITICAL_CSS
      document.head.appendChild(el)
    } else {
      moveToHeadEnd(el)
    }
    closeJsonEditorPathEditor()
  } finally {
    injectingOverrides = false
  }
}

/** 监听 head 新增样式（vanilla-jsoneditor 运行时注入），始终把覆写样式移到末尾 */
export function startJsonEditorOverrideWatcher(): void {
  watcherRefCount += 1
  injectJsonEditorCriticalOverrides()

  if (headObserver) return

  headObserver = new MutationObserver((mutations) => {
    const styleAdded = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) =>
          node instanceof HTMLStyleElement ||
          (node instanceof HTMLLinkElement && node.rel === 'stylesheet')
      )
    )
    if (!styleAdded) return
    injectJsonEditorCriticalOverrides()
  })
  headObserver.observe(document.head, { childList: true })
}

export function stopJsonEditorOverrideWatcher(): void {
  watcherRefCount = Math.max(0, watcherRefCount - 1)
  if (watcherRefCount > 0) return

  headObserver?.disconnect()
  headObserver = null
  document.getElementById(STYLE_ID)?.remove()
}
