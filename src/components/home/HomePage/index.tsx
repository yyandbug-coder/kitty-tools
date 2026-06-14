// 应用主页 - 按分类展示全部功能入口，支持扩展注册新功能
import { useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import toast from 'react-hot-toast'
import { useAppConfig } from '@/hooks/useAppConfig'
import { buildFeatureCatalog } from '@/lib/feature-catalog'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import type { FeatureAction } from '@/types/features'
import FeatureCard from '@/components/home/FeatureCard'
import { APP_DISPLAY_NAME } from '@/lib/app-meta'

export interface HomePageProps {
  onNavigateSettings: () => void
  onOpenExternalFeature?: () => void
}

/** 打开独立浮层/工作台后隐藏主窗口，避免遮挡 */
const HIDE_MAIN_AFTER_INVOKE = new Set([
  'show_window',
  'show_launcher_window',
  'show_translate_workspace_window',
  'translate_selection',
  'start_screenshot_translate',
])

export default function HomePage({ onNavigateSettings, onOpenExternalFeature }: HomePageProps) {
  const { config } = useAppConfig()
  const categories = useMemo(() => buildFeatureCatalog(config), [config])

  const handleActivate = useCallback(
    async (action: FeatureAction) => {
      if (action.type === 'navigate') {
        if (action.view === 'settings') {
          onNavigateSettings()
        }
        return
      }

      try {
        await invoke(action.command)
        if (HIDE_MAIN_AFTER_INVOKE.has(action.command)) {
          onOpenExternalFeature?.()
        }
      } catch (err) {
        toast.error(getInvokeErrorMessage(err) || '无法打开该功能')
      }
    },
    [onNavigateSettings, onOpenExternalFeature]
  )

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
      <div className="space-y-8 p-4 sm:p-5">
        <section className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">欢迎使用 {APP_DISPLAY_NAME}</h2>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            一站式桌面效率工具集。选择下方功能即可打开，也可通过全局快捷键随时唤起。
          </p>
        </section>

        {categories.map((category) => (
          <section key={category.id} className="space-y-3" aria-labelledby={`category-${category.id}`}>
            <div className="space-y-0.5">
              <h3 id={`category-${category.id}`} className="text-sm font-medium">
                {category.title}
              </h3>
              {category.description ? (
                <p className="text-xs text-muted-foreground">{category.description}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {category.features.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  title={feature.title}
                  description={feature.description}
                  icon={feature.icon}
                  action={feature.action}
                  status={feature.status}
                  shortcutDisplay={feature.shortcutDisplay}
                  onActivate={handleActivate}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
