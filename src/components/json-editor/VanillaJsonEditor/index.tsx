/**
 * vanilla-jsoneditor 的 React 包装器：生命周期管理、主题切换、仅传递变更 props。
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  createJSONEditor,
  type Content,
  type JSONEditorPropsOptional,
  type JsonEditor,
} from 'vanilla-jsoneditor'
import 'vanilla-jsoneditor/themes/jse-theme-dark.css'
import '@/assets/styles/json-editor-overrides.css'
import { JSON_EDITOR_ZH_PROPS } from '@/lib/json-editor-i18n'
import {
  injectJsonEditorCriticalOverrides,
  startJsonEditorOverrideWatcher,
  stopJsonEditorOverrideWatcher,
} from '@/lib/json-editor-inject-overrides'
import { cn } from '@/lib/utils'

const OVERRIDE_STYLE_ID = 'kitty-json-editor-overrides-priority'

/** 将 Vite 注入的 link 样式（若有）移到 head 末尾（已是末尾则跳过，避免触发样式监听器死循环） */
function bumpBundledOverrideStyles(): void {
  const existing = document.getElementById(OVERRIDE_STYLE_ID)
  if (existing) {
    if (document.head.lastElementChild !== existing) {
      document.head.appendChild(existing)
    }
    return
  }

  const sheets = Array.from(document.styleSheets)
  for (const sheet of sheets) {
    const owner = sheet.ownerNode
    if (
      owner instanceof HTMLLinkElement &&
      owner.href.includes('json-editor-overrides')
    ) {
      owner.id = OVERRIDE_STYLE_ID
      if (document.head.lastElementChild !== owner) {
        document.head.appendChild(owner)
      }
      return
    }
  }
}

function filterUnchangedProps(
  props: JSONEditorPropsOptional,
  prev: JSONEditorPropsOptional
): JSONEditorPropsOptional {
  const changed: JSONEditorPropsOptional = {}
  const keys = Object.keys(props) as Array<keyof JSONEditorPropsOptional>
  for (const key of keys) {
    if (props[key] !== prev[key]) {
      ;(changed as Record<string, unknown>)[key] = props[key]
    }
  }
  return changed
}

export interface VanillaJsonEditorProps extends JSONEditorPropsOptional {
  isDarkMode?: boolean
  className?: string
}

export default function VanillaJsonEditor({
  isDarkMode = false,
  className,
  ...props
}: VanillaJsonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const refEditor = useRef<JsonEditor | null>(null)
  const refPrevProps = useRef<JSONEditorPropsOptional>({})
  const propsRef = useRef({ ...JSON_EDITOR_ZH_PROPS, ...props })
  propsRef.current = { ...JSON_EDITOR_ZH_PROPS, ...props }

  useEffect(() => {
    const target = mountRef.current
    if (!target) return

    const editor = createJSONEditor({
      target,
      props: propsRef.current,
    })
    refEditor.current = editor
    refPrevProps.current = {}

    editor.updateProps(propsRef.current)
    startJsonEditorOverrideWatcher()
    void editor.refresh().then(() => {
      bumpBundledOverrideStyles()
      injectJsonEditorCriticalOverrides()
    })

    return () => {
      stopJsonEditorOverrideWatcher()
      void editor.destroy()
      refEditor.current = null
      refPrevProps.current = {}
    }
  }, [])

  useLayoutEffect(() => {
    const editor = refEditor.current
    if (!editor) return
    const merged = propsRef.current
    const changed = filterUnchangedProps(merged, refPrevProps.current)
    if (Object.keys(changed).length > 0) {
      editor.updateProps(changed)
    }
    refPrevProps.current = merged
  })

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    el.classList.toggle('jse-theme-dark', isDarkMode)
    void refEditor.current?.refresh()
    injectJsonEditorCriticalOverrides()
  }, [isDarkMode])

  return (
    <div
      ref={hostRef}
      data-kitty-json-editor
      className={cn('kitty-json-editor-host h-full w-full min-h-0', className)}
    >
      <div ref={mountRef} className="h-full w-full min-h-0" />
    </div>
  )
}

export type { Content, JSONEditorPropsOptional }
