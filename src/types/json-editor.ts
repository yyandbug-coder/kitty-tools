import type { ContentErrors } from 'vanilla-jsoneditor'

/** JSON 编辑器视图模式：单栏树形/文本，或分屏（树形编辑 + 文本预览） */
export type JsonEditorViewMode = 'tree' | 'text' | 'split'

/** JSON 编辑器默认视图模式 */
export const JSON_EDITOR_DEFAULT_VIEW_MODE: JsonEditorViewMode = 'split'

/** 分屏默认左右比例（百分比，左侧宽度） */
export const JSON_EDITOR_SPLIT_DEFAULT_RATIO = 50

/** 分屏比例可调范围 */
export const JSON_EDITOR_SPLIT_MIN_RATIO = 25
export const JSON_EDITOR_SPLIT_MAX_RATIO = 75

/** 最近打开文件列表上限 */
export const JSON_EDITOR_RECENT_FILES_MAX = 8

/** 本地持久化的编辑器偏好（SQLite settings 表） */
export interface JsonEditorPrefs {
  viewMode: JsonEditorViewMode
  splitRatio: number
  recentFiles: string[]
}

/** 存在未保存改动时需二次确认的操作 */
export type JsonEditorUnsavedAction =
  | { type: 'close' }
  | { type: 'new' }
  | { type: 'open' }
  | { type: 'openPath'; path: string }
  | { type: 'importText'; text: string }

export interface JsonEditorChangeStatus {
  contentErrors: ContentErrors | undefined
}
