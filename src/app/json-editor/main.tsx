// JSON 编辑器入口：由 html/json-editor.html 加载；独立可调整大小窗口，跟随全局主题
import React, { useMemo } from 'react'
import type { CSSProperties } from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from '@/hooks/ConfigProvider'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import JsonEditorPanel from '@/components/json-editor/JsonEditorPanel'
import GlobalToaster from '@/components/shared/GlobalToaster'
import { cn } from '@/lib/utils'
import '@/assets/styles/tailwind/index.css'
import '@/assets/styles/json-editor-overrides.css'

function JsonEditorApp() {
  const { config, loaded } = useAppConfig()
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
  )

  if (!loaded) {
    return (
      <>
        <div className="flex h-full min-h-0 w-full items-center justify-center bg-background">
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

  return (
    <div
      className={cn(
        'flex h-full w-full min-h-0 flex-col overflow-hidden bg-background text-foreground',
        isDarkMode && 'dark'
      )}
      data-kitty-theme-scope
      data-theme={config.appThemePreset}
      style={appStyle}
    >
      <JsonEditorPanel isDarkMode={isDarkMode} />
      <GlobalToaster />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider>
        <JsonEditorApp />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
