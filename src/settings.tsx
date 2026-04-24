// 设置窗口入口页面 - 应用主题色运行时样式，与其它窗口保持一致
import React from 'react'
import type { CSSProperties } from 'react'
import ReactDOM from 'react-dom/client'
import { useState, useMemo } from 'react'
import { ConfigProvider, useAppConfig } from '@/hooks/useAppConfig'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from 'react-hot-toast'
import SettingsPanel from '@/components/settings/SettingsPanel'
import { cn } from '@/lib/utils'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import '@/assets/styles/tailwind/index.css'

function SettingsApp() {
  const { config } = useAppConfig()
  const [systemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  const isDarkMode = config.theme === 'dark' || (config.theme === 'system' && systemPrefersDark)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode, config.backgroundOpacity) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode, config.backgroundOpacity],
  )

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
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <TooltipProvider>
          <SettingsApp />
          <Toaster />
        </TooltipProvider>
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
