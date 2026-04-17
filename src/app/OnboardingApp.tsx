import { useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ClipboardListIcon,
  KeyboardIcon,
  MousePointer2Icon,
  ScissorsLineDashedIcon,
  Settings2Icon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react'
import { Button } from '@translate/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@translate/components/ui/card'
import { ConfigProvider, useConfig } from '@translate/hooks/useConfig'
import { useAppSettings } from '@clipboard/hooks/useAppSettings'
import { formatShortcutForDisplay as formatTranslateShortcut } from '@translate/lib/platform'
import { formatShortcutForDisplay as formatClipboardShortcut } from '@clipboard/lib/shortcuts'

function FeatureCard({
  icon: Icon,
  title,
  description,
  shortcut,
}: {
  icon: typeof SparklesIcon
  title: string
  description: string
  shortcut?: string
}) {
  return (
    <Card className="border-border/70 bg-background/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="leading-6">{description}</p>
        {shortcut ? (
          <div className="w-fit rounded-lg border border-border/70 bg-muted/45 px-2.5 py-1 text-xs font-mono text-foreground/90">
            {shortcut}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OnboardingPage() {
  const { config, updateConfig } = useConfig()
  const { settings } = useAppSettings()

  const clipboardShortcut = useMemo(
    () => formatClipboardShortcut(settings.globalShortcut),
    [settings.globalShortcut],
  )
  const selectionShortcut = useMemo(
    () => formatTranslateShortcut(config.hotkeySelection),
    [config.hotkeySelection],
  )
  const screenshotShortcut = useMemo(
    () => formatTranslateShortcut(config.hotkeyScreenshot),
    [config.hotkeyScreenshot],
  )

  const closeOnboarding = async () => {
    const window = getCurrentWindow()
    await window.hide()
  }

  const finishAndOpenSettings = async () => {
    await updateConfig({ firstRun: false })
    await invoke('app_open_workspace', { module: 'translate' })
    await closeOnboarding()
  }

  const finishAndRunInBackground = async () => {
    await updateConfig({ firstRun: false })
    await closeOnboarding()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(242,93,120,0.18),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,255,255,0.92))] text-foreground">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-background/75 px-7 py-6 backdrop-blur">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-4 text-primary" />
            <p className="text-sm font-semibold tracking-tight">欢迎使用 Kitty Utils</p>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">静默运行的剪贴板与翻译工具</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            应用常驻系统托盘，日常通过快捷键直接工作。你可以随时用托盘右键打开设置页，
            管理翻译引擎、快捷键、剪贴板历史与界面风格。
          </p>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-auto px-7 py-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <FeatureCard
            icon={ClipboardListIcon}
            title="历史记录面板"
            description="呼出独立剪贴板历史面板，搜索、收藏、预览并快速粘贴最近复制过的内容。"
            shortcut={clipboardShortcut}
          />
          <FeatureCard
            icon={MousePointer2Icon}
            title="划词翻译"
            description="选中文字后按下快捷键，应用会读取当前选区内容并在悬浮结果窗中展示翻译。"
            shortcut={selectionShortcut}
          />
          <FeatureCard
            icon={ScissorsLineDashedIcon}
            title="截图翻译"
            description="按下快捷键后拖拽选择区域，应用会进行 OCR 识别并自动翻译截图中的文本。"
            shortcut={screenshotShortcut}
          />
          <FeatureCard
            icon={Settings2Icon}
            title="托盘右键设置"
            description="平时无需保留主窗口。需要修改配置时，从系统托盘右键菜单进入统一设置页即可。"
          />
        </div>

        <Card className="mt-5 border-primary/25 bg-primary/5 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <WandSparklesIcon className="size-4 text-primary" />
              建议的使用方式
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
            <p>1. 先在设置页确认翻译服务与快捷键没有和其他软件冲突。</p>
            <p>2. 日常使用时无需打开设置窗口，直接用快捷键调用截图翻译、划词翻译和历史记录面板。</p>
            <p>3. 需要修改行为时，通过系统托盘右键进入设置；关闭设置窗口不会退出应用。</p>
          </CardContent>
        </Card>
      </main>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-background/75 px-7 py-5 backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <KeyboardIcon className="size-4" />
          首次引导完成后，后续启动将不再自动弹出。
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void finishAndRunInBackground()}>
            完成并后台运行
          </Button>
          <Button type="button" onClick={() => void finishAndOpenSettings()}>
            前往设置
          </Button>
        </div>
      </footer>
    </div>
  )
}

export default function OnboardingApp() {
  return (
    <ConfigProvider>
      <OnboardingPage />
    </ConfigProvider>
  )
}
