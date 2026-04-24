// 欢迎引导页 - 首次使用时展示功能介绍
import { useState, useEffect } from 'react'
import { useAppConfig } from '@/hooks/useAppConfig'
import { Button } from '@/components/ui/button'
import { ClipboardList, Languages, Camera, Sparkles } from 'lucide-react'
import AppLogoIcon from '@/components/shared/AppLogoIcon'
import toast from 'react-hot-toast'

export default function WelcomeOnboarding() {
  const { config, updateConfig } = useAppConfig()
  const [countdown, setCountdown] = useState(15)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const handleComplete = async () => {
    if (completing) return
    setCompleting(true)
    try {
      await updateConfig({ firstRun: false })
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch (e) {
      toast.error('初始化失败，请重试')
      setCompleting(false)
    }
  }

  const features = [
    {
      icon: ClipboardList,
      title: '剪贴板历史',
      shortcut: config.clipboardShortcut || 'Ctrl+Shift+V'
    },
    {
      icon: Languages,
      title: '划词翻译',
      shortcut: config.hotkeySelection || 'Ctrl+Shift+T'
    },
    {
      icon: Camera,
      title: '截图翻译',
      shortcut: config.hotkeyScreenshot || 'Ctrl+Shift+S'
    }
  ]

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background text-foreground p-6 overflow-hidden">
      <AppLogoIcon className="size-14 mb-3" />
      <Sparkles className="size-5 text-primary mb-1.5" />
      <h1 className="text-xl font-bold mb-1.5">欢迎使用 Kitty Tools</h1>
      <p className="text-sm text-muted-foreground text-center mb-5 max-w-md">
        集剪贴板管理与翻译于一体的桌面工具箱。
        <br />
        应用将在系统托盘中运行，通过全局快捷键呼出。
      </p>
      <div className="space-y-2 text-sm mb-5 w-full max-w-xs">
        {features.map(({ icon: Icon, title, shortcut }) => (
          <div key={title} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
            <Icon className="size-5 text-primary shrink-0" aria-hidden />
            <div className="flex-1">
              <div className="font-medium">{title}</div>
              <div className="text-xs text-muted-foreground">快捷键: {shortcut}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button onClick={handleComplete} disabled={countdown > 0 || completing} className="px-8">
          {completing ? '正在初始化…' : countdown > 0 ? `请先了解功能 (${countdown}s)` : '开始使用'}
        </Button>
        {countdown > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleComplete}
            disabled={completing}
            className="text-xs text-muted-foreground"
          >
            跳过
          </Button>
        )}
      </div>
    </div>
  )
}
