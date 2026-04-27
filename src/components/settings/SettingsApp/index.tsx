// 设置主界面 - 由 index.html 挂载，开发预览与 Tauri 设置窗口共用；应用主题与 SettingsPanel
import { useState, useEffect, useMemo, type CSSProperties } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import SettingsPanel from '@/components/settings/SettingsPanel'
import { cn } from '@/lib/utils'
import { Toaster } from 'react-hot-toast'

export default function SettingsApp() {
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
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode, config.backgroundOpacity) as CSSProperties,
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
        'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
        isDarkMode && 'dark',
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
    >
      <SettingsPanel />
      <Toaster position="top-center" toastOptions={{ duration: 3200, className: 'text-sm' }} />
    </div>
  )
}
