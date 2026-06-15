import { loadJsonSettingsByKey, saveJsonSettingsByKey } from '@/services/database'
import {
  JSON_EDITOR_RECENT_FILES_MAX,
  JSON_EDITOR_SPLIT_DEFAULT_RATIO,
  JSON_EDITOR_DEFAULT_VIEW_MODE,
  type JsonEditorPrefs,
  type JsonEditorViewMode,
} from '@/types/json-editor'

const PREFS_KEY = 'json-editor-prefs'

const DEFAULT_PREFS: JsonEditorPrefs = {
  viewMode: JSON_EDITOR_DEFAULT_VIEW_MODE,
  splitRatio: JSON_EDITOR_SPLIT_DEFAULT_RATIO,
  recentFiles: [],
}

function clampSplitRatio(value: number): number {
  return Math.min(75, Math.max(25, Math.round(value)))
}

function normalizeViewMode(value: unknown): JsonEditorViewMode {
  if (value === 'tree' || value === 'text' || value === 'split') return value
  return 'split'
}

export async function loadJsonEditorPrefs(): Promise<JsonEditorPrefs> {
  const stored = await loadJsonSettingsByKey<Partial<JsonEditorPrefs>>(PREFS_KEY)
  if (!stored) return { ...DEFAULT_PREFS }
  return {
    viewMode: normalizeViewMode(stored.viewMode),
    splitRatio: clampSplitRatio(stored.splitRatio ?? DEFAULT_PREFS.splitRatio),
    recentFiles: Array.isArray(stored.recentFiles)
      ? stored.recentFiles.filter((p): p is string => typeof p === 'string').slice(0, JSON_EDITOR_RECENT_FILES_MAX)
      : [],
  }
}

export async function saveJsonEditorPrefs(prefs: JsonEditorPrefs): Promise<void> {
  await saveJsonSettingsByKey(PREFS_KEY, {
    viewMode: prefs.viewMode,
    splitRatio: clampSplitRatio(prefs.splitRatio),
    recentFiles: prefs.recentFiles.slice(0, JSON_EDITOR_RECENT_FILES_MAX),
  })
}

/** 将路径插入最近列表头部并去重 */
export function pushJsonEditorRecentFile(recentFiles: string[], path: string): string[] {
  return [path, ...recentFiles.filter((item) => item !== path)].slice(0, JSON_EDITOR_RECENT_FILES_MAX)
}
