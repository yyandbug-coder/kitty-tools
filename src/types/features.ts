import type { LucideIcon } from 'lucide-react'
import type { AppConfig } from '@/types'

/** 功能项可用状态 */
export type FeatureStatus = 'available' | 'coming-soon'

/** 点击功能后的动作类型 */
export type FeatureAction =
  | { type: 'invoke'; command: string }
  | { type: 'navigate'; view: 'settings' }

/** 单个功能条目（注册表中的静态定义） */
export interface FeatureDefinition {
  id: string
  title: string
  description: string
  icon: LucideIcon
  action: FeatureAction
  status: FeatureStatus
  /** 从 AppConfig 读取快捷键用于展示；无则不在卡片上显示热键 */
  shortcutConfigKey?: keyof AppConfig
}

/** 功能分类 */
export interface FeatureCategoryDefinition {
  id: string
  title: string
  description?: string
  features: FeatureDefinition[]
}

/** 渲染用：已解析快捷键文案的功能项 */
export interface FeatureItemView extends FeatureDefinition {
  shortcutDisplay: string | null
}

/** 渲染用：带解析后功能项的分类 */
export interface FeatureCategoryView {
  id: string
  title: string
  description?: string
  features: FeatureItemView[]
}
