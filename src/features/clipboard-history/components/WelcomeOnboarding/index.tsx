/**
 * 首次使用欢迎说明 - 必读若干秒后方可关闭，避免用户跳过快捷键等重要提示
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@clipboard/components/ui/alert-dialog'
import { Button } from '@clipboard/components/ui/button'
import { formatShortcutForDisplay } from '@clipboard/lib/shortcuts'
import { cn } from '@clipboard/lib/utils'
import type { AppSettings } from '@clipboard/types'
import { APP_DISPLAY_NAME } from '@clipboard/lib/app-meta'

const WELCOME_STORAGE_KEY = 'kitty-welcome-v1'
const MIN_READ_SECONDS = 5

interface Props {
  open: boolean
  globalShortcut: AppSettings['globalShortcut']
  /** 与主界面一致：禁止拖选说明文字 */
  disableTextSelection?: boolean
  onDismiss: (remember: boolean) => void
}

export function hasCompletedWelcomeOnboarding(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  return window.localStorage.getItem(WELCOME_STORAGE_KEY) === '1'
}

export function markWelcomeOnboardingComplete() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(WELCOME_STORAGE_KEY, '1')
}

export default function WelcomeOnboarding({
  open,
  globalShortcut,
  disableTextSelection = false,
  onDismiss,
}: Props) {
  const shortcutLabel = formatShortcutForDisplay(globalShortcut)
  const dismissWithRememberRef = useRef(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const secondsLeftRef = useRef(0)
  secondsLeftRef.current = secondsLeft

  useLayoutEffect(() => {
    if (open) {
      setSecondsLeft(MIN_READ_SECONDS)
    } else {
      setSecondsLeft(0)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [open])

  const canClose = open && secondsLeft <= 0

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (secondsLeftRef.current > 0) {
            return
          }
          const remember = dismissWithRememberRef.current
          dismissWithRememberRef.current = false
          onDismiss(remember)
        }
      }}
    >
      <AlertDialogContent
        className={cn(
          'max-w-md gap-5 border-border/80 bg-background p-6 text-foreground shadow-2xl',
          'ring-1 ring-black/5 dark:ring-white/10',
          disableTextSelection && 'select-none',
        )}
        onEscapeKeyDown={(e) => {
          if (secondsLeftRef.current > 0) {
            e.preventDefault()
          }
        }}
      >
        <AlertDialogHeader className="gap-3">
          <AlertDialogTitle className="text-lg font-semibold tracking-tight text-foreground">
            欢迎使用 {APP_DISPLAY_NAME}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm leading-6 text-foreground/88 [&_li]:marker:text-foreground/50">
              <p className="text-foreground/90">
                这是常驻后台的剪贴板历史工具。随时按下{' '}
                <kbd
                  className={cn(
                    'rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground',
                    'shadow-[inset_0_-1px_0_0_color-mix(in_oklch,var(--border)_60%,transparent)]',
                  )}
                >
                  {shortcutLabel}
                </kbd>{' '}
                即可呼出或收起窗口。
              </p>
              <ul className="list-inside list-disc space-y-1.5 pl-0.5 text-foreground/85">
                <li>本应用没有传统「主窗口」，平时常驻后台；请留意任务栏或托盘（菜单栏）里的图标。</li>
                <li>
                  托盘图标：左键呼出或隐藏剪贴板列表；右键（macOS 上可为辅助点按）打开菜单，可选「打开设置」「退出」等。
                </li>
                <li>设置在独立窗口中管理；请通过托盘（菜单栏）菜单中的「打开设置」进入。</li>
                <li>方向键选择条目，Enter 粘贴到当前应用（可在设置中关闭）。</li>
                <li>Esc 隐藏剪贴板窗口；复制新内容后列表会自动置顶。</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2" aria-live="polite">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="ghost"
              disabled={!canClose}
              className="mt-0 min-w-0 border border-border bg-muted/70 text-foreground tabular-nums hover:bg-muted disabled:pointer-events-none disabled:opacity-45"
              onPointerDownCapture={() => {
                dismissWithRememberRef.current = false
              }}
            >
              {secondsLeft > 0 ? `稍后提醒（${secondsLeft} 秒）` : '稍后提醒'}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant="primary"
              disabled={!canClose}
              className="min-w-0 bg-primary text-primary-foreground shadow-md tabular-nums hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
              onPointerDownCapture={() => {
                dismissWithRememberRef.current = true
              }}
            >
              {secondsLeft > 0 ? `知道了（${secondsLeft} 秒）` : '知道了'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
