// 设置 — 通用：自启、深浅色、主题色
import { Power, Sun, Moon, Monitor, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import CustomColorPicker from '@/components/CustomColorPicker'
import { PRESET_THEMES, getThemeOption } from '@/lib/theme'
import { cn } from '@/lib/utils'
import type { AppConfig } from '@/types'

export interface SettingsGeneralTabProps {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
}

export default function SettingsGeneralTab({ config, updateConfig }: SettingsGeneralTabProps) {
  return (
    <Card>
      <CardContent className="space-y-5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Power className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium leading-none">开机自启</span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                打开后写入系统登录启动项，关闭后移除。
              </span>
            </div>
          </div>
          <Switch
            checked={config.launchOnStartup}
            onCheckedChange={(v) => void updateConfig({ launchOnStartup: v })}
            aria-label="开机自启"
          />
        </div>

        <div className="flex items-center justify-between gap-3" role="group" aria-label="深浅模式">
          <span className="shrink-0 text-sm font-medium">深浅模式</span>
          <div className="flex shrink-0 gap-1">
            {(
              [
                { value: 'light' as const, icon: Sun, label: '浅色' },
                { value: 'dark' as const, icon: Moon, label: '深色' },
                { value: 'system' as const, icon: Monitor, label: '跟随系统' },
              ]
            ).map(({ value, label, icon: Icon }) => (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'size-9',
                      config.theme === value &&
                        'bg-accent text-accent-foreground shadow-sm hover:bg-accent hover:text-accent-foreground',
                    )}
                    aria-label={label}
                    aria-pressed={config.theme === value}
                    onClick={() => void updateConfig({ theme: value })}
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3" role="group" aria-label="主题色">
          <span className="shrink-0 text-sm font-medium">主题色</span>
          <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-2">
            {PRESET_THEMES.map((t) => {
              const active = config.appThemePreset === t.id
              return (
                <Button
                  key={t.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-auto rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active ? 'text-white shadow-sm hover:opacity-95' : 'bg-background hover:bg-accent/50',
                  )}
                  style={
                    active
                      ? { backgroundColor: t.accent, borderColor: t.accent }
                      : { borderColor: t.accent, color: t.accent }
                  }
                  aria-label={`主题色：${t.label}`}
                  aria-pressed={active}
                  onClick={() => void updateConfig({ appThemePreset: t.id })}
                >
                  {t.label}
                </Button>
              )
            })}

            <Popover>
              <PopoverTrigger asChild>
                {(() => {
                  const customActive = config.appThemePreset === 'custom'
                  const customColor = getThemeOption('custom', config.customHue).accent
                  return (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-auto rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                        customActive ? 'text-white shadow-sm hover:opacity-95' : 'bg-background hover:bg-accent/50',
                      )}
                      style={
                        customActive
                          ? { backgroundColor: customColor, borderColor: customColor }
                          : { borderColor: customColor, color: customColor }
                      }
                      aria-label="自定义主题色"
                      aria-pressed={customActive}
                    >
                      {!customActive && <Palette className="size-3 shrink-0" aria-hidden />}
                      自定义
                    </Button>
                  )
                })()}
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" side="bottom" align="end">
                <CustomColorPicker
                  value={config.customHue}
                  onChange={(hue) => void updateConfig({ appThemePreset: 'custom', customHue: hue })}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
