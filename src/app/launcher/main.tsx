// 启动器入口：由 html/launcher.html 加载；不透明窗口 + bg-background，与划词翻译浮窗一致
import React, { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import { useAppConfig } from '@/hooks/useAppConfig'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import LauncherPanel from '@/components/launcher/LauncherPanel'
import { Toaster } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import '@/assets/styles/tailwind/index.css'

function LauncherApp() {
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
    () =>
      getThemeRuntimeStyle(
        config.appThemePreset as AppTheme,
        config.customHue,
        isDarkMode,
        config.backgroundOpacity,
      ) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode, config.backgroundOpacity],
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
        'flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
        isDarkMode && 'dark',
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
    >
      <LauncherPanel />
      <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <LauncherApp />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
