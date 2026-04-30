// 设置主界面 - 由 html/index.html 挂载 src/app/main.tsx；与 Tauri 设置窗口共用；应用主题与 SettingsPanel
import { useMemo, type CSSProperties } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useKittyIsDarkMode } from '@/hooks/useKittyIsDarkMode'
import { getThemeRuntimeStyle } from '@/lib/theme'
import type { AppTheme } from '@/types'
import SettingsPanel from '@/components/settings/SettingsPanel'
import { cn } from '@/lib/utils'
import GlobalToaster from '@/components/shared/GlobalToaster'

export default function SettingsApp() {
  const { config, loaded } = useAppConfig()
  const isDarkMode = useKittyIsDarkMode(config.theme)
  const appStyle = useMemo(
    () => getThemeRuntimeStyle(config.appThemePreset as AppTheme, config.customHue, isDarkMode) as CSSProperties,
    [config.appThemePreset, config.customHue, isDarkMode]
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
        <GlobalToaster />
      </>
    )
  }

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
      <SettingsPanel />
      <GlobalToaster />
    </div>
  )
}
