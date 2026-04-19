import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
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
import { useGlobalAppSettings } from '@/shared/hooks/useGlobalAppSettings'
import { useAppSettings } from '@clipboard/hooks/useAppSettings'
import { ThemeProvider } from '@clipboard/components/ThemeProvider'
import { getThemeRuntimeStyle } from '@clipboard/lib/theme'
import {
  themedChromeSurfaceClassName,
  themedOverlaySurfaceClassName,
  themedPrimarySurfaceClassName,
  themedWindowSurfaceClassName,
} from '@/shared/lib/theme-surfaces'
import { cn } from '@clipboard/lib/utils'
import { formatShortcutForDisplay as formatTranslateShortcut } from '@translate/lib/platform'
import { formatShortcutForDisplay as formatClipboardShortcut } from '@clipboard/lib/shortcuts'

const ONBOARDING_BACKGROUND_CLOSE_SECONDS = 15

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
    <Card className="border-[color-mix(in_oklch,var(--border)_36%,transparent)] bg-[color-mix(in_oklch,var(--card)_72%,transparent)] shadow-sm backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p className="leading-6">{description}</p>
        {shortcut ? (
          <div className="w-fit rounded-lg border border-[color-mix(in_oklch,var(--border)_42%,transparent)] bg-[color-mix(in_oklch,var(--secondary)_52%,transparent)] px-2.5 py-1 text-xs font-mono text-foreground/90">
            {shortcut}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function OnboardingPage() {
  const { config, updateConfig } = useConfig()
  const { settings: clipboardSettings, isLoading: isClipboardLoading } = useAppSettings()
  const { settings, updateSettings, loaded } = useGlobalAppSettings()
  const [stepIndex, setStepIndex] = useState(0)
  const [secondsOpen, setSecondsOpen] = useState(0)
  const closeUnlockedRef = useRef(false)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const isDarkMode =
    settings.colorMode === 'dark' || (settings.colorMode === 'system' && systemPrefersDark)

  const appStyle = useMemo(
    () => getThemeRuntimeStyle(settings, isDarkMode) as CSSProperties,
    [settings.backgroundOpacity, settings.theme, settings.customHue, isDarkMode],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateThemeMode = (event: MediaQueryList | MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    mediaQuery.addEventListener('change', updateThemeMode)
    return () => mediaQuery.removeEventListener('change', updateThemeMode)
  }, [])

  const resetCloseGate = useCallback(() => {
    setStepIndex(0)
    setSecondsOpen(0)
    closeUnlockedRef.current = false
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void listen('onboarding:opened', () => {
      resetCloseGate()
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [resetCloseGate])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const timer = window.setInterval(() => {
      setSecondsOpen((prev) => prev + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const clipboardShortcut = useMemo(
    () => formatClipboardShortcut(clipboardSettings.globalShortcut),
    [clipboardSettings.globalShortcut],
  )
  const selectionShortcut = useMemo(
    () => formatTranslateShortcut(config.hotkeySelection),
    [config.hotkeySelection],
  )
  const screenshotShortcut = useMemo(
    () => formatTranslateShortcut(config.hotkeyScreenshot),
    [config.hotkeyScreenshot],
  )

  const steps = useMemo(
    () => [
      {
        id: 'intro',
        eyebrow: '第一步',
        title: '这是什么应用',
        description:
          'Kitty Tools 是一个常驻系统托盘的桌面工具，不依赖主窗口常开。平时你只需要记住快捷键，或者从托盘右键菜单进入设置。',
        content: (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="border-[color-mix(in_oklch,var(--primary)_28%,transparent)] bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <SparklesIcon className="size-4 text-primary" />
                  静默工作的方式
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
                <p>应用启动后会常驻托盘，不需要保持设置页或其他面板一直打开。</p>
                <p>关闭设置窗口不会退出程序；真正退出请使用托盘右键菜单中的“退出”。</p>
                <p>首次引导完成后，后续启动将默认静默运行，不会再自动打断你。</p>
              </CardContent>
            </Card>

            <Card className="border-[color-mix(in_oklch,var(--border)_36%,transparent)] bg-[color-mix(in_oklch,var(--card)_72%,transparent)] shadow-sm backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Settings2Icon className="size-4 text-primary" />
                  你主要会用到什么
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
                <p>1. 历史记录面板：查看最近复制过的内容。</p>
                <p>2. 划词翻译：选中文字后立即翻译。</p>
                <p>3. 截图翻译：框选屏幕区域并识别翻译其中的文字。</p>
                <p>4. 统一设置页：修改主题、快捷键、翻译引擎和数据行为。</p>
              </CardContent>
            </Card>
          </div>
        ),
      },
      {
        id: 'features',
        eyebrow: '第二步',
        title: '如何触发核心功能',
        description: '下面这几个能力是你日常最常用的入口，建议先确认快捷键是否符合你的习惯。',
        content: (
          <div className="grid gap-4 xl:grid-cols-2">
            <FeatureCard
              icon={ClipboardListIcon}
              title="历史记录面板"
              description="手动触发独立剪贴板历史面板，搜索、收藏、预览并快速粘贴最近复制过的内容。"
              shortcut={clipboardShortcut}
            />
            <FeatureCard
              icon={MousePointer2Icon}
              title="划词翻译"
              description="选中文字后按下快捷键，应用会读取当前选区内容，并在独立翻译面板中展示结果。"
              shortcut={selectionShortcut}
            />
            <FeatureCard
              icon={ScissorsLineDashedIcon}
              title="截图翻译"
              description="按下快捷键后拖拽选择区域，应用会进行 OCR 识别，并自动翻译截图中的文本。"
              shortcut={screenshotShortcut}
            />
            <FeatureCard
              icon={Settings2Icon}
              title="托盘右键设置"
              description="平时无需保留主窗口。需要修改配置时，从系统托盘右键菜单进入统一设置页即可。"
            />
          </div>
        ),
      },
      {
        id: 'workflow',
        eyebrow: '第三步',
        title: '推荐使用方式',
        description:
          '完成这一步之后，你就可以把它当成一个“平时看不见、按快捷键就出现”的后台工具来使用。',
        content: (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="border-[color-mix(in_oklch,var(--primary)_28%,transparent)] bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <WandSparklesIcon className="size-4 text-primary" />
                  推荐流程
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
                <p>1. 先进入设置页，确认翻译服务是否可用，并检查快捷键没有和其他软件冲突。</p>
                <p>2. 日常使用时无需打开设置窗口，直接通过快捷键调用截图翻译、划词翻译和历史记录面板。</p>
                <p>3. 需要修改行为时，再通过系统托盘右键进入设置；关闭设置窗口不会退出应用。</p>
              </CardContent>
            </Card>

            <Card className="border-[color-mix(in_oklch,var(--border)_36%,transparent)] bg-[color-mix(in_oklch,var(--card)_72%,transparent)] shadow-sm backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <KeyboardIcon className="size-4 text-primary" />
                  准备完成
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm leading-7 text-muted-foreground">
                <p>如果你想继续配置，点“前往设置”。</p>
                <p>如果你已经了解用法，点“完成并后台运行”即可直接开始使用。</p>
                <p>完成后应用会继续在后台运行，后续可随时从托盘进入设置调整行为。</p>
              </CardContent>
            </Card>
          </div>
        ),
      },
    ],
    [clipboardShortcut, screenshotShortcut, selectionShortcut],
  )

  const currentStep = steps[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === steps.length - 1
  const secondsUntilBackgroundClose = Math.max(0, ONBOARDING_BACKGROUND_CLOSE_SECONDS - secondsOpen)
  const canRunInBackground = secondsUntilBackgroundClose === 0

  useEffect(() => {
    if (!canRunInBackground || closeUnlockedRef.current) {
      return
    }
    closeUnlockedRef.current = true
    void invoke('app_unlock_onboarding_close')
  }, [canRunInBackground])

  const closeOnboarding = async () => {
    await invoke('app_unlock_onboarding_close')
    await invoke('app_hide_onboarding')
  }

  const finishAndOpenSettings = async () => {
    await updateConfig({ firstRun: false })
    await invoke('app_open_workspace', { module: 'settings' })
    await closeOnboarding()
  }

  const finishAndRunInBackground = async () => {
    if (!canRunInBackground) {
      return
    }
    await updateConfig({ firstRun: false })
    await closeOnboarding()
  }

  if (!loaded || isClipboardLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        正在准备欢迎页…
      </div>
    )
  }

  return (
    <ThemeProvider
      colorMode={settings.colorMode}
      onColorModeChange={(mode) => updateSettings({ colorMode: mode })}
      systemPrefersDark={systemPrefersDark}
    >
      <div
        className={cn(
          'flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] text-foreground',
          themedWindowSurfaceClassName,
          isDarkMode && 'dark',
        )}
        data-kitty-theme-scope
        data-theme={settings.theme}
        data-window="onboarding"
        style={appStyle}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,color-mix(in_oklch,var(--theme-accent,var(--ring))_22%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_96%,white_4%),color-mix(in_oklch,var(--background)_88%,transparent))]">
          <header
            className={cn(
              'flex shrink-0 items-start justify-between gap-4 border-b px-7 py-6',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" />
                <p className="text-sm font-semibold tracking-tight">欢迎使用 Kitty Tools</p>
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">{currentStep.title}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                {currentStep.description}
              </p>
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col overflow-auto px-7 py-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={cn(
                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-left text-xs transition-colors',
                    index === stepIndex
                      ? cn(themedPrimarySurfaceClassName, 'text-foreground')
                      : cn(
                          themedOverlaySurfaceClassName,
                          'text-muted-foreground hover:bg-[color-mix(in_oklch,var(--accent)_44%,transparent)] hover:text-foreground',
                        ),
                  )}
                  onClick={() => setStepIndex(index)}
                >
                  <span className="rounded-full bg-[color-mix(in_oklch,var(--background)_82%,transparent)] px-1.5 py-0.5 font-medium text-[10px]">
                    {index + 1}
                  </span>
                  <span>{step.eyebrow}</span>
                </button>
              ))}
            </div>

            <p className="mb-5 text-xs text-muted-foreground">
              {canRunInBackground
                ? '已可点击“完成并后台运行”关闭欢迎页。'
                : `“完成并后台运行”将在 ${secondsUntilBackgroundClose} 秒后可用。`}
            </p>

            <div className="flex min-h-0 flex-1 flex-col">{currentStep.content}</div>
          </main>

          <footer
            className={cn(
              'flex shrink-0 items-center justify-between gap-3 border-t px-7 py-5',
              themedChromeSurfaceClassName,
              'border-[color-mix(in_oklch,var(--border)_34%,transparent)]',
            )}
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KeyboardIcon className="size-4" />
              {currentStep.eyebrow} · 共 {steps.length} 步
            </div>
            <div className="flex items-center gap-2">
              {!isFirstStep ? (
                <Button type="button" variant="outline" onClick={() => setStepIndex((prev) => prev - 1)}>
                  <ArrowLeftIcon className="size-4" />
                  上一步
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canRunInBackground}
                  onClick={() => void finishAndRunInBackground()}
                >
                  {canRunInBackground
                    ? '完成并后台运行'
                    : `完成并后台运行（${secondsUntilBackgroundClose}s）`}
                </Button>
              )}
              {isLastStep ? (
                <Button type="button" onClick={() => void finishAndOpenSettings()}>
                  前往设置
                </Button>
              ) : (
                <Button type="button" onClick={() => setStepIndex((prev) => prev + 1)}>
                  下一步
                  <ArrowRightIcon className="size-4" />
                </Button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </ThemeProvider>
  )
}

export default function OnboardingApp() {
  return (
    <ConfigProvider>
      <OnboardingPage />
    </ConfigProvider>
  )
}
