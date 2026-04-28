// 设置 — 交互：全局快捷键与开发环境下引导页入口
import { useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import toast from 'react-hot-toast'
import { Keyboard, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import HotkeyInput from '@/components/shared/HotkeyInput'
import { DEFAULT_CONFIG, type AppConfig } from '@/types'

export interface SettingsShortcutsTabProps {
  config: AppConfig
  updateConfig: (updates: Partial<AppConfig>) => Promise<void>
}

export default function SettingsShortcutsTab({ config, updateConfig }: SettingsShortcutsTabProps) {
  const otherForSelection = useMemo(
    () => [
      { label: '截图翻译', value: config.hotkeyScreenshot },
      { label: '剪贴板历史', value: config.clipboardShortcut },
      { label: '启动器', value: config.launcherShortcut },
    ],
    [config.clipboardShortcut, config.hotkeyScreenshot, config.launcherShortcut],
  )
  const otherForScreenshot = useMemo(
    () => [
      { label: '划词翻译', value: config.hotkeySelection },
      { label: '剪贴板历史', value: config.clipboardShortcut },
      { label: '启动器', value: config.launcherShortcut },
    ],
    [config.clipboardShortcut, config.hotkeySelection, config.launcherShortcut],
  )
  const otherForClipboard = useMemo(
    () => [
      { label: '划词翻译', value: config.hotkeySelection },
      { label: '截图翻译', value: config.hotkeyScreenshot },
      { label: '启动器', value: config.launcherShortcut },
    ],
    [config.hotkeySelection, config.hotkeyScreenshot, config.launcherShortcut],
  )
  const otherForLauncher = useMemo(
    () => [
      { label: '划词翻译', value: config.hotkeySelection },
      { label: '截图翻译', value: config.hotkeyScreenshot },
      { label: '剪贴板历史', value: config.clipboardShortcut },
    ],
    [config.clipboardShortcut, config.hotkeySelection, config.hotkeyScreenshot],
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Keyboard className="size-4" />
          交互
        </CardTitle>
        <p className="text-xs text-muted-foreground">全局快捷键。</p>
      </CardHeader>
      <CardContent className="p-0">
        {import.meta.env.DEV ? (
          <div className="border-b border-border px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void invoke('show_onboarding_window_cmd')
                  .then(() => toast.success('已打开引导页'))
                  .catch((e: unknown) => toast.error(typeof e === 'string' ? e : String(e)))
              }}
            >
              <Sparkles className="size-3.5" />
              打开引导页
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">仅开发环境显示，用于预览首次引导界面。</p>
          </div>
        ) : null}
        <div className="divide-y divide-border">
          <HotkeyInput
            id="hotkey-selection"
            label="划词翻译"
            value={config.hotkeySelection}
            defaultValue={DEFAULT_CONFIG.hotkeySelection}
            onChange={async (v) => updateConfig({ hotkeySelection: v })}
            otherHotkeys={otherForSelection}
          />
          <HotkeyInput
            id="hotkey-screenshot"
            label="截图翻译"
            value={config.hotkeyScreenshot}
            defaultValue={DEFAULT_CONFIG.hotkeyScreenshot}
            onChange={async (v) => updateConfig({ hotkeyScreenshot: v })}
            otherHotkeys={otherForScreenshot}
          />
          <HotkeyInput
            id="hotkey-clipboard"
            label="剪贴板历史"
            value={config.clipboardShortcut}
            defaultValue={DEFAULT_CONFIG.clipboardShortcut}
            onChange={async (v) => updateConfig({ clipboardShortcut: v })}
            otherHotkeys={otherForClipboard}
          />
          <HotkeyInput
            id="hotkey-launcher"
            label="启动器"
            value={config.launcherShortcut}
            defaultValue={DEFAULT_CONFIG.launcherShortcut}
            onChange={async (v) => updateConfig({ launcherShortcut: v })}
            otherHotkeys={otherForLauncher}
          />
        </div>
      </CardContent>
    </Card>
  )
}
