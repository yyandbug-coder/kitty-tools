// 欢迎引导页 - 首次使用时分步介绍启动器、剪贴板、翻译等，并含本地可交互的启动器「模拟搜索」
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAppConfig } from '@/hooks/useAppConfig'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import ShortcutKbd from '@/components/shared/ShortcutKbd'
import { formatShortcutForDisplay } from '@/lib/platform'
import {
  type LucideIcon,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Languages,
  LayoutGrid,
  Search,
  Sparkles
} from 'lucide-react'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

interface StepMeta {
  id: string
  title: string
  description: string
  icon: LucideIcon
  panel: ReactNode
}

const MOCK_LAUNCHER_ROWS: { title: string; sub: string }[] = [
  { title: '设置', sub: '打开应用设置' },
  { title: '剪贴板历史', sub: '呼出历史面板' },
  { title: '在浏览器中打开官网', sub: '示例：输入 https://' }
]

/** 不请求后端，仅本地过滤，演示「输入即筛选」与启动器交互感 */
function MockLauncherSearchDemo() {
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return MOCK_LAUNCHER_ROWS.slice(0, 3)
    return MOCK_LAUNCHER_ROWS.filter((r) => r.title.toLowerCase().includes(t) || r.sub.toLowerCase().includes(t))
  }, [q])

  return (
    <div
      className="rounded-xl border border-border/80 bg-background/60 p-3 shadow-sm ring-1 ring-foreground/5"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground sm:text-xs">
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span>在下方输入几个字，看列表如何随输入变化（演示用，不连接本机数据）</span>
      </div>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="例如：设置、翻译、剪贴板…"
        className="mb-2 h-9 text-sm"
        aria-label="启动器搜索演示"
      />
      <ul className="space-y-1" role="list">
        {rows.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border/80 px-2 py-3 text-center text-xs text-muted-foreground">
            没有匹配，真实启动器会连接应用、书签、文件等数据。
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.title}
              className="flex cursor-default flex-col gap-0.5 rounded-lg border border-transparent bg-muted/40 px-2.5 py-2 text-left transition-colors hover:border-border/60"
            >
              <span className="text-sm font-medium">{r.title}</span>
              <span className="text-[11px] text-muted-foreground sm:text-xs">{r.sub}</span>
            </li>
          ))
        )}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
        实机中还可搜索系统应用、书签、本地文件。若只搜文件，可在框内先输入
        <Kbd>find</Kbd> 或 <Kbd>open</Kbd>，再加空格，然后输入文件名关键词。
      </p>
    </div>
  )
}

const SKIP_COOLDOWN_SEC = 15

export interface WelcomeOnboardingProps {
  /** 完成或跳过引导后进入功能主页 */
  onComplete: () => void
}

export default function WelcomeOnboarding({ onComplete }: WelcomeOnboardingProps) {
  const { config, updateConfig } = useAppConfig()
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)
  // 用户已完成过引导（重置/重装后再次进入）：直接允许跳过，无需倒计时。
  const initialSkipSeconds = config.firstRun ? SKIP_COOLDOWN_SEC : 0
  const [skipSecondsLeft, setSkipSecondsLeft] = useState(initialSkipSeconds)
  const skipTimerRef = useRef<number | null>(null)

  const clearSkipTimer = useCallback(() => {
    if (skipTimerRef.current !== null) {
      window.clearInterval(skipTimerRef.current)
      skipTimerRef.current = null
    }
  }, [])

  const startSkipCountdown = useCallback(() => {
    clearSkipTimer()
    // 已完成过引导（firstRun=false）的用户：直接允许跳过，不再启动倒计时。
    if (!config.firstRun) {
      setSkipSecondsLeft(0)
      return
    }
    setSkipSecondsLeft(SKIP_COOLDOWN_SEC)
    const id = window.setInterval(() => {
      setSkipSecondsLeft((n) => {
        if (n <= 1) {
          if (skipTimerRef.current !== null) {
            window.clearInterval(skipTimerRef.current)
            skipTimerRef.current = null
          }
          return 0
        }
        return n - 1
      })
    }, 1000)
    skipTimerRef.current = id
  }, [clearSkipTimer, config.firstRun])

  useEffect(() => {
    startSkipCountdown()
    return () => {
      clearSkipTimer()
    }
  }, [startSkipCountdown, clearSkipTimer])

  const launcherKeys = config.launcherShortcut ? formatShortcutForDisplay(config.launcherShortcut) : null
  const clipboardKeys = config.clipboardShortcut ? formatShortcutForDisplay(config.clipboardShortcut) : null
  const selectionKeys = config.hotkeySelection ? formatShortcutForDisplay(config.hotkeySelection) : null
  const screenshotKeys = config.hotkeyScreenshot ? formatShortcutForDisplay(config.hotkeyScreenshot) : null

  const steps: StepMeta[] = useMemo(
    () => [
      {
        id: 'welcome',
        title: '欢迎使用',
        description: 'Kitty Tools 在后台常驻，通过全局快捷键和系统托盘快速打开各功能。下面几步带你熟悉用法。',
        icon: Sparkles,
        panel: (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              完成引导后将进入<strong className="text-foreground/90">功能主页</strong>
              ，应用会继续在<strong className="text-foreground/90">托盘区</strong>
              运行（无任务栏/程序坞图标时，请留意托盘图标）。
            </p>
            <p>
              所有快捷键都可在 <strong className="text-foreground/90">「设置」</strong>{' '}
              中按习惯修改；本页展示的是你当前的配置键位。
            </p>
            <p className="text-xs text-muted-foreground/90">
              小提示：使用键盘上的 <Kbd>←</Kbd> <Kbd>→</Kbd> 也可切换步骤（在输入框外）。
            </p>
          </div>
        )
      },
      {
        id: 'launcher',
        title: '启动器',
        description:
          '像 Spotlight / Alfred 一样，一处输入即可打开系统应用、设置项、网页、书签、本地文件等（可在「设置 → 启动器」里细化来源与范围）。',
        icon: Search,
        panel: (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">呼出启动器</span>
              <ShortcutKbd formatted={launcherKeys} className="text-foreground" />
            </div>
            <ul className="list-inside list-disc space-y-1.5 pl-0.5 text-sm text-muted-foreground marker:text-primary">
              <li>
                输入关键词筛选，<Kbd className="text-foreground">Enter</Kbd> 执行当前高亮项；用{' '}
                <Kbd className="text-foreground">↑</Kbd> <Kbd className="text-foreground">↓</Kbd> 在列表中移动。
              </li>
              <li>
                点击标题栏图钉，可让窗口<strong className="text-foreground/90">失焦不自动关闭</strong>
                ，方便多步操作（与剪贴板「固定」类似）。
              </li>
            </ul>
            <MockLauncherSearchDemo />
          </div>
        )
      },
      {
        id: 'clipboard',
        title: '剪贴板历史',
        description: '自动记录你复制过的文本，随时回溯并一键粘贴，避免找来找去。',
        icon: ClipboardList,
        panel: (
          <ul className="list-inside list-disc space-y-1.5 pl-0.5 text-sm text-muted-foreground marker:text-primary">
            <li>
              使用 <ShortcutKbd formatted={clipboardKeys} className="text-foreground" /> 呼出历史面板；选中条目后按{' '}
              <Kbd className="text-foreground">Enter</Kbd> 可粘贴到当前光标处（视设置项而定）。
            </li>
            <li>可搜索、可预览；历史条数与保留天数在设置里可调（减轻隐私与空间顾虑）。</li>
          </ul>
        )
      },
      {
        id: 'translate',
        title: '划词与截图翻译',
        description: '先选中屏幕上的文字，或框选区域做 OCR 再翻译，适合阅读外文与界面文案。',
        icon: Languages,
        panel: (
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <LayoutGrid className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="mb-1 font-medium text-foreground">划词翻译</p>
                <p>
                  在任意软件中<strong className="text-foreground/90">选中文字</strong>，再按{' '}
                  <ShortcutKbd formatted={selectionKeys} className="text-foreground" />{' '}
                  触发翻译（具体行为依当前翻译/浮窗实现）。
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Camera className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div>
                <p className="mb-1 font-medium text-foreground">截图翻译</p>
                <p>
                  按 <ShortcutKbd formatted={screenshotKeys} className="text-foreground" />{' '}
                  后框选屏幕区域，对图像做识别并翻译（需配置对应翻译/ OCR 服务）。
                </p>
              </div>
            </div>
            <p className="text-xs">
              翻译引擎、语言对与 API 密钥在「设置 → 翻译」中配置；首次使用建议先完成网络与密钥相关项。
            </p>
          </div>
        )
      },
      {
        id: 'finish',
        title: '托盘与下一步',
        description: '不记快捷键也没关系：右键 / 左键点击托盘中的 Kitty 图标，可直接打开各功能、设置与退出。',
        icon: CheckCircle2,
        panel: (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>托盘菜单中通常包含：剪贴板、启动器、划词、截图、打开主界面、退出 等，与本次引导内容一致。</p>
            <p>
              若你希望开机自动启动，可在 <strong className="text-foreground/90">设置</strong>{' '}
              中开启自启动；完成下方按钮后，本页不会再自动弹出（除非你重置「首次运行」相关配置）。
            </p>
          </div>
        )
      }
    ],
    [launcherKeys, clipboardKeys, selectionKeys, screenshotKeys]
  )

  const lastIndex = steps.length - 1
  const isFirst = step === 0
  const isLast = step === lastIndex

  const goPrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  const goNext = useCallback(() => {
    setStep((s) => Math.min(lastIndex, s + 1))
  }, [lastIndex])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (t instanceof HTMLElement && t.isContentEditable) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev])

  // 再次打开引导时回到第 1 步并重置跳过倒计时
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    void listen('show-welcome-onboarding', () => {
      setStep(0)
      setCompleting(false)
      startSkipCountdown()
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
  }, [startSkipCountdown])

  const runFinish = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await updateConfig({ firstRun: false })
      onComplete()
    } catch {
      toast.error('初始化失败，请重试')
      setCompleting(false)
    }
  }

  /** 最后一步「进入应用」：不等待跳过倒计时 */
  const handleEnterApp = () => {
    void runFinish()
  }

  /** 顶部「跳过」：须倒计时结束 */
  const handleSkip = () => {
    if (skipSecondsLeft > 0) return
    void runFinish()
  }

  const current = steps[step]
  const Icon = current.icon

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border/60 bg-card/30 px-4 py-3 sm:px-6" data-tauri-drag-region>
        <div className="mx-auto flex w-full max-w-2xl min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <AppLogoIcon className="size-9 shrink-0 sm:size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">Kitty Tools</p>
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                新手指引 · {step + 1} / {steps.length}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={handleSkip}
            disabled={completing || skipSecondsLeft > 0}
            aria-label={skipSecondsLeft > 0 ? `${skipSecondsLeft} 秒后可跳过` : '跳过引导'}
          >
            {skipSecondsLeft > 0 ? `跳过（${skipSecondsLeft}s）` : '跳过'}
          </Button>
        </div>
        <nav
          className="mx-auto mt-3 flex w-full max-w-2xl flex-wrap items-center justify-center gap-1.5 sm:gap-2"
          aria-label="引导步骤"
        >
          {steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                'h-2 w-2 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-ring',
                i === step ? 'w-6 bg-primary' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              aria-label={`第 ${i + 1} 步：${s.title}`}
              aria-current={i === step ? 'step' : undefined}
            />
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 sm:py-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-12">
                  <Icon className="size-5 sm:size-6" aria-hidden />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-xl">{current.title}</CardTitle>
                  <CardDescription className="mt-1.5 text-sm leading-relaxed">{current.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm pb-2">{current.panel}</CardContent>
          </Card>
        </div>
      </div>

      <footer
        className="shrink-0 border-t border-border/60 bg-card/30 px-2 py-2.5 sm:px-3 sm:py-3"
        role="contentinfo"
        aria-label="引导操作"
      >
        <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-nowrap items-stretch gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="default"
            onClick={goPrev}
            disabled={isFirst || completing}
            className="h-9 min-w-0 flex-1"
          >
            <ChevronLeft className="size-4" />
            上一步
          </Button>
          {!isLast ? (
            <Button type="button" onClick={goNext} disabled={completing} className="h-9 min-w-0 flex-1">
              下一步
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" onClick={handleEnterApp} disabled={completing} className="h-9 min-w-0 flex-1">
              {completing ? '正在保存…' : '进入主页'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
