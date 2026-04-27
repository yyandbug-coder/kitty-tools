// 翻译工作台 - 无系统装饰窗；首行 Logo+标题+关闭，次行为快捷键说明，下为翻译面板
import React, { useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import ShortcutKbd from '@/components/shared/ShortcutKbd'
import { formatShortcutForDisplay } from '@/lib/platform'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import TranslatePanel from '@/components/translate/TranslatePanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import '@/assets/styles/tailwind/index.css'

function TranslateWorkspaceApp() {
  const { config, loaded } = useAppConfig()
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode],
  )

  const handleCloseWindow = useCallback(() => {
    void getCurrentWindow().hide()
  }, [])

  if (!loaded) {
    return (
      <div className="flex h-full min-h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="relative size-8">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-border/50 border-t-primary" />
          </div>
          <span className="text-xs text-muted-foreground">加载配置中…</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
        isDarkMode && 'dark',
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
    >
      <header className="flex shrink-0 flex-col border-b border-border/50">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
            <AppLogoIcon className="size-5 shrink-0" alt="" aria-hidden />
            <h1 className="min-w-0 truncate text-sm font-semibold tracking-tight">翻译工作台</h1>
          </div>
          <div className="shrink-0" data-no-drag="true">
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
        </div>
        <p
          className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 border-t border-border/40 px-4 py-1.5 pl-6 text-[11px] leading-tight text-muted-foreground"
          data-tauri-drag-region
        >
          <span>划词</span>
          <ShortcutKbd formatted={formatShortcutForDisplay(config.hotkeySelection)} />
          <span aria-hidden>·</span>
          <span>截图</span>
          <ShortcutKbd formatted={formatShortcutForDisplay(config.hotkeyScreenshot)} />
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-3">
        <TranslatePanel />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <TooltipProvider>
          <TranslateWorkspaceApp />
          <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
        </TooltipProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
