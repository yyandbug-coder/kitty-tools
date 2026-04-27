// 设置面板 — 标签页枚举与侧栏项（与 SettingsPanel 共用）
import type { LucideIcon } from 'lucide-react'
import { Settings, ClipboardList, Globe, Keyboard, Search, Info } from 'lucide-react'

export const SETTINGS_TAB = {
  general: 'general',
  clipboard: 'clipboard',
  translate: 'translate',
  shortcuts: 'shortcuts',
  launcher: 'launcher',
  about: 'about'
} as const

export type SettingsTabId = (typeof SETTINGS_TAB)[keyof typeof SETTINGS_TAB]

export interface SettingsTabItem {
  value: SettingsTabId
  icon: LucideIcon
  label: string
}

export const SETTINGS_TAB_ITEMS: SettingsTabItem[] = [
  { value: SETTINGS_TAB.general, icon: Settings, label: '通用' },
  { value: SETTINGS_TAB.clipboard, icon: ClipboardList, label: '剪贴板' },
  { value: SETTINGS_TAB.translate, icon: Globe, label: '翻译' },
  { value: SETTINGS_TAB.launcher, icon: Search, label: '启动器' },
  { value: SETTINGS_TAB.shortcuts, icon: Keyboard, label: '交互' },
  { value: SETTINGS_TAB.about, icon: Info, label: '关于' }
]
