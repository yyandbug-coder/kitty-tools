// 开发调试栏 - 仅 dev 构建显示，提供欢迎引导等预览入口
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface DevDebugBarProps {
  onOpenWelcome: () => void
}

export default function DevDebugBar({ onOpenWelcome }: DevDebugBarProps) {
  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <section
      className="rounded-xl border border-dashed border-primary/35 bg-primary/5 p-3 sm:p-4"
      aria-label="开发调试"
    >
      <p className="text-xs font-medium text-muted-foreground">开发调试</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/90">
        以下入口仅出现在开发模式，不会打进正式包。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onOpenWelcome}>
          <Sparkles className="size-3.5" aria-hidden />
          预览欢迎引导
        </Button>
      </div>
    </section>
  )
}
