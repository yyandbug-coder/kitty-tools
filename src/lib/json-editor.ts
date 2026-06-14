import {
  isContentParseError,
  isContentValidationErrors,
  type Content,
  type ContentErrors,
} from 'vanilla-jsoneditor'

/** 编辑器默认展示的示例 JSON */
const DEFAULT_JSON_SAMPLE = {
  app: 'kitty-tools',
  version: '0.1.2',
  description: '桌面效率工具集',
  features: [
    { id: 'clipboard-history', title: '剪贴板历史', enabled: true },
    { id: 'launcher', title: '启动器', enabled: true },
    { id: 'json-editor', title: 'JSON 编辑器', enabled: true },
  ],
  settings: {
    theme: 'auto',
    shortcuts: {
      launcher: 'Alt+Space',
      clipboard: 'Ctrl+Shift+V',
    },
  },
  meta: {
    updatedAt: '2026-06-14',
    count: 42,
    active: true,
    note: null,
  },
} as const

/** 默认 JSON 文档（含示例数据，便于初次打开时体验编辑与分屏预览） */
export function createDefaultJsonContent(): Content {
  return {
    text: JSON.stringify(structuredClone(DEFAULT_JSON_SAMPLE), null, 2),
  }
}

/** @deprecated 使用 createDefaultJsonContent */
export function createEmptyJsonContent(): Content {
  return createDefaultJsonContent()
}

/** 从文件文本解析为编辑器 Content */
export function textToEditorContent(text: string): Content {
  const trimmed = text.trim()
  if (!trimmed) {
    return { text: '{\n  \n}' }
  }
  try {
    return { json: JSON.parse(trimmed) as unknown }
  } catch {
    return { text }
  }
}

/** 将 Content 序列化为可写入文件的文本 */
export function contentToFileText(content: Content, indent = 2): string | null {
  if ('text' in content && content.text !== undefined) {
    return content.text
  }
  if ('json' in content && content.json !== undefined) {
    return JSON.stringify(content.json, null, indent)
  }
  return null
}

/** 格式化 JSON 文本 */
export function beautifyJsonText(text: string): string {
  const parsed = JSON.parse(text) as unknown
  return JSON.stringify(parsed, null, 2)
}

/** 压缩 JSON 文本 */
export function compactJsonText(text: string): string {
  const parsed = JSON.parse(text) as unknown
  return JSON.stringify(parsed)
}

/** 将 Content 转为格式化文本；解析失败时返回 null */
export function beautifyContent(content: Content): Content | null {
  const raw = contentToFileText(content, 0)
  if (raw === null) return null
  try {
    return { json: JSON.parse(beautifyJsonText(raw)) as unknown }
  } catch {
    return null
  }
}

/** 将 Content 转为压缩文本；解析失败时返回 null */
export function compactContent(content: Content): Content | null {
  const raw = contentToFileText(content, 0)
  if (raw === null) return null
  try {
    return { json: JSON.parse(compactJsonText(raw)) as unknown }
  } catch {
    return null
  }
}

/** 内容是否通过校验（无解析/验证错误） */
export function isJsonContentValid(errors: ContentErrors | undefined): boolean {
  if (!errors) return true
  if (isContentParseError(errors)) return false
  if (isContentValidationErrors(errors)) {
    return errors.validationErrors.length === 0
  }
  return true
}

/** 从完整路径提取文件名 */
export function basenameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || filePath
}
