// 主应用壳层 - 主页与设置页切换，统一窗口标题栏与关闭逻辑
import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ArrowLeft, Settings, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useMemo, type CSSProperties } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import { getThemeRuntimeStyle } from '@/lib/theme'
import { getInvokeErrorMessage } from '@/lib/invoke-helpers'
import { APP_DISPLAY_NAME } from '@/lib/app-meta'
import type { AppTheme } from '@/types'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import GlobalToaster from '@/components/shared/GlobalToaster'
import HomePage from '@/components/home/HomePage'
import SettingsPanel from '@/components/settings/SettingsPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type MainAppView = 'home' | 'settings'

export default function MainAppShell() {
  const { config, loaded } = useAppConfig()
  const [view, setView] = useState<MainAppView>('home')
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
  )

  const handleCloseWindow = useCallback(() => {
    void invoke('hide_settings_window').catch((err) => {
      toast.error(getInvokeErrorMessage(err) || '无法关闭窗口')
    })
  }, [])

  const handleOpenExternalFeature = useCallback(() => {
    void invoke('hide_settings_window').catch(() => {})
  }, [])

  if (!loaded) {
    return (
      <>
        <div className="flex h-full min-h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="relative size-8">
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
            </div>
            <span className="text-xs text-muted-foreground">加载配置中…</span>
          </div>
        </div>
        <GlobalToaster />
      </>
    )
  }

  const headerTitle = view === 'home' ? APP_DISPLAY_NAME : `${APP_DISPLAY_NAME} 设置`

  return (
    <div
      className={cn(
        'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
        isDarkMode && 'dark'
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3" data-tauri-drag-region>
          {view === 'settings' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setView('home')}
              aria-label="返回主页"
              data-no-drag="true"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
          ) : (
            <AppLogoIcon className="size-5 shrink-0" alt="" aria-hidden />
          )}
          <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight" data-tauri-drag-region>
            {headerTitle}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" data-no-drag="true">
          {view === 'home' ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setView('settings')}
              aria-label="打开设置"
            >
              <Settings className="size-4" aria-hidden />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={handleCloseWindow}
            aria-label="关闭窗口"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === 'home' ? (
          <HomePage
            onNavigateSettings={() => setView('settings')}
            onOpenExternalFeature={handleOpenExternalFeature}
          />
        ) : (
          <SettingsPanel embedded />
        )}
      </div>

      <GlobalToaster />
    </div>
  )
}
