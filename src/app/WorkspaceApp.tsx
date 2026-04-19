import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { PanelsTopLeftIcon, Settings2Icon, SparklesIcon, WandSparklesIcon } from 'lucide-react'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { getThemeRuntimeStyle } from '@/shared/lib/theme'
import SettingsWindowApp from '@clipboard/components/SettingsWindowApp'
import TranslateSettingsApp from '@translate/App'
import { CommonSettingsPanel } from '@/app/CommonSettingsPanel'
import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'
import {
  themedCardSurfaceClassName,
  themedChromeSurfaceClassName,
  themedOverlaySurfaceClassName,
  themedPanelSurfaceClassName,
  themedPrimarySurfaceClassName,
  themedWindowSurfaceClassName,
} from '@/shared/lib/theme-surfaces'
import { isAppModuleId, type AppModuleId } from '@/shared/types/app'
import { cn } from '@clipboard/lib/utils'

const SETTINGS_TABS: Array<{
  id: AppModuleId
  label: string
  description: string
  icon: typeof WandSparklesIcon
}> = [
  {
    id: 'settings',
    label: '通用设置',
    description: '全局主题、暗黑模式与开机自启。',
    icon: Settings2Icon,
  },
  {
    id: 'translate',
    label: '翻译设置',
    description: '翻译服务、划词与截图快捷键。',
    icon: WandSparklesIcon,
  },
  {
    id: 'clipboard-history',
    label: '剪贴板历史',
    description: '历史记录、显示风格、清理与导入导出。',
    icon: PanelsTopLeftIcon,
  },
]

export default function WorkspaceApp() {
  const { settings, loaded, setLastActiveModule, updateSettings } = useGlobalAppSettings()
  const [activeTab, setActiveTab] = useState<AppModuleId>(settings.lastActiveModule)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const isDarkMode =
    settings.colorMode === 'dark' || (settings.colorMode === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(settings, isDarkMode) as CSSProperties,
    [settings.backgroundOpacity, settings.theme, settings.customHue, isDarkMode],
  )

  useEffect(() => {
    if (loaded) {
      setActiveTab(settings.lastActiveModule)
    }
  }, [loaded, settings.lastActiveModule])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeMode = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    updateThemeMode(mediaQuery)
    mediaQuery.addEventListener('change', updateThemeMode)
    return () => mediaQuery.removeEventListener('change', updateThemeMode)
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined

    void listen<AppModuleId>('workspace:navigate', (event) => {
      if (!isAppModuleId(event.payload)) {
        return
      }
      setActiveTab(event.payload)
      setLastActiveModule(event.payload)
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [setLastActiveModule])

  const currentTab = SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0]

  return (
    <ThemeProvider
      colorMode={settings.colorMode}
      onColorModeChange={(mode) => updateSettings({ colorMode: mode })}
      systemPrefersDark={systemPrefersDark}
    >
      <div
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] text-foreground',
          themedWindowSurfaceClassName,
          isDarkMode && 'dark',
        )}
        data-kitty-theme-scope
        data-theme={settings.theme}
        data-window="settings"
        style={appStyle}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--theme-accent,var(--ring))_14%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_98%,white_2%),color-mix(in_oklch,var(--background)_90%,transparent))]">
          <header
            className={cn(
              'flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_32%,transparent)]',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Settings2Icon className="size-4 text-primary" />
                <p className="text-sm font-semibold tracking-tight">Kitty Tools 设置</p>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                常驻系统托盘；日常功能通过快捷键和托盘菜单触发。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = tab.id === activeTab

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm transition-colors',
                      isActive
                        ? cn(themedPrimarySurfaceClassName, 'text-foreground')
                        : cn(
                            themedOverlaySurfaceClassName,
                            'text-muted-foreground hover:bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] hover:text-foreground',
                          ),
                    )}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setLastActiveModule(tab.id)
                    }}
                    title={tab.description}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="whitespace-nowrap font-medium">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-5">
            <div className={cn('mb-4 shrink-0 rounded-[24px] px-4 py-3', themedCardSurfaceClassName)}>
              <div className="flex items-start gap-3">
                <SparklesIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{currentTab.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{currentTab.description}</p>
                </div>
              </div>
            </div>

            <div className={cn('min-h-0 flex-1 overflow-hidden rounded-[28px]', themedPanelSurfaceClassName)}>
              {activeTab === 'settings' ? (
                <CommonSettingsPanel />
              ) : activeTab === 'translate' ? (
                <TranslateSettingsApp />
              ) : (
                <SettingsWindowApp />
              )}
            </div>
          </div>
        </div>
      </div>
    </ThemeProvider>
  )
}
