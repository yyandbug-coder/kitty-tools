import type { ContentErrors } from 'vanilla-jsoneditor'

/** JSON 编辑器视图模式：单栏树形/文本，或分屏（树形编辑 + 文本预览） */
export type JsonEditorViewMode = 'tree' | 'text' | 'split'

/** 分屏默认左右比例（百分比，左侧宽度） */
export const JSON_EDITOR_SPLIT_DEFAULT_RATIO = 50

/** 分屏比例可调范围 */
export const JSON_EDITOR_SPLIT_MIN_RATIO = 25
export const JSON_EDITOR_SPLIT_MAX_RATIO = 75

export interface JsonEditorChangeStatus {
  contentErrors: ContentErrors | undefined
}
