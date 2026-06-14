import {
  ClipboardList,
  Keyboard,
  Languages,
  ScanText,
  Search,
  Settings,
} from 'lucide-react'
import type { AppConfig } from '@/types'
import type { FeatureCategoryDefinition, FeatureCategoryView } from '@/types/features'
import { formatShortcutForDisplay } from '@/lib/platform'

/**
 * 功能注册表 — 新增功能时在此追加分类与条目即可，主页会自动分类展示。
 * shortcutConfigKey 对应 AppConfig 中的快捷键字段，用于卡片上展示热键提示。
 */
export const FEATURE_CATALOG: FeatureCategoryDefinition[] = [
  {
    id: 'productivity',
    title: '效率工具',
    description: '快速唤起常用工具，提升日常操作效率',
    features: [
      {
        id: 'clipboard-history',
        title: '剪贴板历史',
        description: '记录并检索复制内容，支持文本、图片与文件，Alfred 风格快速粘贴',
        icon: ClipboardList,
        action: { type: 'invoke', command: 'show_window' },
        status: 'available',
        shortcutConfigKey: 'clipboardShortcut',
      },
      {
        id: 'launcher',
        title: '启动器',
        description: '搜索并打开应用、文件、书签与内置功能，一站式命令面板',
        icon: Search,
        action: { type: 'invoke', command: 'show_launcher_window' },
        status: 'available',
        shortcutConfigKey: 'launcherShortcut',
      },
    ],
  },
  {
    id: 'translate',
    title: '翻译',
    description: '划词与截图翻译，覆盖多种翻译场景',
    features: [
      {
        id: 'selection-translate',
        title: '划词翻译',
        description: '选中任意文本后即时翻译，结果以悬浮窗展示',
        icon: Languages,
        action: { type: 'invoke', command: 'translate_selection' },
        status: 'available',
        shortcutConfigKey: 'hotkeySelection',
      },
      {
        id: 'screenshot-translate',
        title: '截图翻译',
        description: '框选屏幕区域，识别图中文字并翻译',
        icon: ScanText,
        action: { type: 'invoke', command: 'start_screenshot_translate' },
        status: 'available',
        shortcutConfigKey: 'hotkeyScreenshot',
      },
    ],
  },
  {
    id: 'system',
    title: '应用',
    description: '偏好设置与个性化配置',
    features: [
      {
        id: 'settings',
        title: '设置',
        description: '快捷键、外观主题、翻译引擎、剪贴板与启动器等全局选项',
        icon: Settings,
        action: { type: 'navigate', view: 'settings' },
        status: 'available',
      },
      {
        id: 'shortcuts-hint',
        title: '快捷键一览',
        description: '在设置 → 交互中查看并自定义全部全局快捷键',
        icon: Keyboard,
        action: { type: 'navigate', view: 'settings' },
        status: 'available',
      },
    ],
  },
]

function resolveShortcutDisplay(config: AppConfig, key?: keyof AppConfig): string | null {
  if (!key) return null
  const raw = config[key]
  if (typeof raw !== 'string' || !raw.trim()) return null
  return formatShortcutForDisplay(raw)
}

/** 将静态注册表与当前配置合并为可渲染数据 */
export function buildFeatureCatalog(config: AppConfig): FeatureCategoryView[] {
  return FEATURE_CATALOG.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    features: category.features.map((feature) => ({
      ...feature,
      shortcutDisplay: resolveShortcutDisplay(config, feature.shortcutConfigKey),
    })),
  }))
}
