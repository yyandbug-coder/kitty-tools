// 翻译工作台入口页面 - 包含标题栏和翻译面板
// 应用主题色运行时样式，与剪贴板面板保持一致
import React from 'react'
import type { CSSProperties } from 'react'
import ReactDOM from 'react-dom/client'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { useState, useEffect, useMemo } from 'react'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import { useAppConfig } from '@/hooks/useAppConfig'
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
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  const isDarkMode = config.theme === 'dark' || (config.theme === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode],
  )

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
        <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
      </>
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
      <header
        className="flex shrink-0 flex-col gap-0.5 border-b px-4 py-2"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <AppLogoIcon className="size-5 shrink-0" aria-hidden />
          <h1 className="text-sm font-semibold tracking-tight">翻译工作台</h1>
        </div>
        <p
          className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 pl-6 text-[11px] leading-tight text-muted-foreground"
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
