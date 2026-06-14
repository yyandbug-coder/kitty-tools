/**
 * vanilla-jsoneditor 的 React 包装器：生命周期管理、主题切换、仅传递变更 props。
 */
import { useEffect, useRef } from 'react'
import {
  createJSONEditor,
  type Content,
  type JSONEditorPropsOptional,
  type JsonEditor,
} from 'vanilla-jsoneditor'
import 'vanilla-jsoneditor/themes/jse-theme-dark.css'
import { JSON_EDITOR_ZH_PROPS } from '@/lib/json-editor-i18n'

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
  const refContainer = useRef<HTMLDivElement>(null)
  const refEditor = useRef<JsonEditor | null>(null)
  const refPrevProps = useRef<JSONEditorPropsOptional>({})
  const propsRef = useRef({ ...JSON_EDITOR_ZH_PROPS, ...props })
  propsRef.current = { ...JSON_EDITOR_ZH_PROPS, ...props }

  useEffect(() => {
    const target = refContainer.current
    if (!target) return

    const editor = createJSONEditor({
      target,
      props: propsRef.current,
    })
    refEditor.current = editor
    refPrevProps.current = {}

    // 挂载后再推一次 props，避免首屏 content 未渲染（尤其 lazy + StrictMode 场景）
    editor.updateProps(propsRef.current)
    void editor.refresh()

    return () => {
      void editor.destroy()
      refEditor.current = null
      refPrevProps.current = {}
    }
  }, [])

  useEffect(() => {
    const editor = refEditor.current
    if (!editor) return
    const merged = { ...JSON_EDITOR_ZH_PROPS, ...props }
    const changed = filterUnchangedProps(merged, refPrevProps.current)
    if (Object.keys(changed).length > 0) {
      editor.updateProps(changed)
    }
    refPrevProps.current = merged
  }, [props])

  useEffect(() => {
    const el = refContainer.current
    if (!el) return
    el.classList.toggle('jse-theme-dark', isDarkMode)
    void refEditor.current?.refresh()
  }, [isDarkMode])

  return (
    <div
      ref={refContainer}
      className={className}
      style={{ height: '100%', width: '100%', minHeight: 0 }}
    />
  )
}

export type { Content, JSONEditorPropsOptional }
