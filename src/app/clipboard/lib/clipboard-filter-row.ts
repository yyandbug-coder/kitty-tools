import type { ClipboardItem } from '@/types'

/** 仅用于关键词匹配，减小传入 Worker 的结构化克隆体积（不含 imageRgba 等大字段） */
export interface ClipboardFilterRow {
  id: string
  type: ClipboardItem['type']
  content: string
  filePaths?: string[]
}
