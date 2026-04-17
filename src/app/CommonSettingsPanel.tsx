import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import {
  Monitor,
  Moon,
  Palette,
  Power,
  RotateCcwIcon,
  SparklesIcon,
  Sun,
} from 'lucide-react'
import { Button } from '@translate/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@translate/components/ui/card'
import { Switch } from '@translate/components/ui/switch'
import { Slider } from '@clipboard/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@clipboard/components/ui/popover'
import CustomColorPicker from '@clipboard/components/CustomColorPicker'
import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'
import { useConfig } from '@translate/hooks/useConfig'
import { getCustomHuePreviewColor, getThemeOption, MAX_BACKGROUND_OPACITY, MIN_BACKGROUND_OPACITY } from '@clipboard/lib/theme'
import { cn } from '@clipboard/lib/utils'

const COLOR_THEME_OPTIONS = [
  { value: 'default' as const, color: '#e11d48', label: '默认玫瑰' },
  { value: 'ocean' as const, color: '#06b6d4', label: '海雾青' },
  { value: 'forest' as const, color: '#10b981', label: '林地绿' },
  { value: 'sunset' as const, color: '#f97316', label: '落日橙' },
]

export function CommonSettingsPanel() {
  const { settings, updateSettings, resetSettings } = useGlobalAppSettings()
  const { updateConfig } = useConfig()
  const [launchOnStartupLoading, setLaunchOnStartupLoading] = useState(false)

  const currentTheme = useMemo(
    () => getThemeOption(settings.theme, settings.customHue),
    [settings.theme, settings.customHue],
  )

  const themeIconOptions: {
    value: 'light' | 'dark' | 'system'
    label: string
    icon: typeof Sun
  }[] = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ]

  useEffect(() => {
    let cancelled = false
    void isEnabled()
      .then((enabled) => {
        if (!cancelled && enabled !== settings.launchOnStartup) {
          updateSettings({ launchOnStartup: enabled })
        }
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [settings.launchOnStartup, updateSettings])

  const handleThemeChange = async (theme: typeof settings.theme) => {
    updateSettings({ theme })
  }

  const handleColorModeChange = async (colorMode: typeof settings.colorMode) => {
    updateSettings({ colorMode })
    await updateConfig({ theme: colorMode })
  }

  const handleCustomHueChange = (customHue: number) => {
    updateSettings({ theme: 'custom', customHue })
  }

  const handleLaunchOnStartupChange = async (checked: boolean) => {
    setLaunchOnStartupLoading(true)
    try {
      if (checked) {
        await enable()
      } else {
        await disable()
      }
      updateSettings({ launchOnStartup: checked })
      await updateConfig({ launchOnStartup: checked })
    } catch {
      const actual = await isEnabled().catch(() => settings.launchOnStartup)
      updateSettings({ launchOnStartup: actual })
    } finally {
      setLaunchOnStartupLoading(false)
    }
  }

  const handleShowOnboardingAgain = async () => {
    await updateConfig({ firstRun: true })
    await invoke('app_show_onboarding')
  }

  const handleResetCommonSettings = async () => {
    resetSettings()
    await updateConfig({
      theme: 'system',
      launchOnStartup: false,
      firstRun: false,
    })
    try {
      await disable()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-5">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Palette className="h-4 w-4" />
              通用外观
            </CardTitle>
            <CardDescription>这一组设置会统一作用于设置页、欢迎页和历史记录面板。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              {COLOR_THEME_OPTIONS.map((themeOption) => (
                <button
                  key={themeOption.value}
                  type="button"
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 bg-(--theme-swatch) transition-all',
                    settings.theme === themeOption.value
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:border-muted-foreground hover:scale-105',
                  )}
                  style={{ ['--theme-swatch' as string]: themeOption.color }}
                  onClick={() => void handleThemeChange(themeOption.value)}
                  title={themeOption.label}
                />
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full border-2 transition-all',
                      settings.theme === 'custom'
                        ? 'border-foreground scale-110 bg-(--custom-swatch)'
                        : 'border-dashed border-muted-foreground/50 hover:border-muted-foreground hover:scale-105',
                    )}
                    style={
                      settings.theme === 'custom'
                        ? { ['--custom-swatch' as string]: getCustomHuePreviewColor(settings.customHue) }
                        : undefined
                    }
                    title="自定义颜色"
                  >
                    <Palette className="size-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" side="bottom" align="end">
                  <CustomColorPicker value={settings.customHue} onChange={(hue) => void handleCustomHueChange(hue)} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">显示模式</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">浅色、深色或跟随系统，全局生效。</p>
              </div>
              <div className="flex items-center gap-1">
                {themeIconOptions.map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    type="button"
                    variant={settings.colorMode === value ? 'default' : 'ghost'}
                    size="icon"
                    className="size-9"
                    aria-label={label}
                    onClick={() => void handleColorModeChange(value)}
                  >
                    <Icon className="size-4" />
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/30 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">背景透明度</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">当前主题：{currentTheme.label}</p>
                </div>
                <span className="rounded-full border border-border/60 bg-background/75 px-2.5 py-1 text-xs">
                  {settings.backgroundOpacity}%
                </span>
              </div>
              <Slider
                min={MIN_BACKGROUND_OPACITY}
                max={MAX_BACKGROUND_OPACITY}
                step={1}
                value={[settings.backgroundOpacity]}
                onValueChange={([value]) => updateSettings({ backgroundOpacity: value })}
                className="mt-4 w-full"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Power className="h-4 w-4" />
              通用行为
            </CardTitle>
            <CardDescription>系统级行为只在这里配置，不再拆散到模块设置中。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-medium">开机自启</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">登录系统后自动在后台运行本应用。</p>
              </div>
              <Switch
                checked={settings.launchOnStartup}
                onCheckedChange={(checked) => void handleLaunchOnStartupChange(checked)}
                disabled={launchOnStartupLoading}
                aria-label="开机自启"
              />
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">欢迎页测试</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  本地测试时可再次打开欢迎页；会同时把首次引导标记改回未完成。
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => void handleShowOnboardingAgain()}>
                <SparklesIcon className="size-4" />
                再次显示欢迎页
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">重置通用设置</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  重置全局主题、暗黑模式、透明度和开机自启，不影响模块数据。
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => void handleResetCommonSettings()}>
                <RotateCcwIcon className="size-4" />
                恢复默认
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
