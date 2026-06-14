// 功能卡片 - 主页中展示单个功能的图标、说明、快捷键与操作入口
import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import ShortcutKbd from '@/components/shared/ShortcutKbd'
import type { FeatureAction, FeatureStatus } from '@/types/features'
import { cn } from '@/lib/utils'

export interface FeatureCardProps {
  title: string
  description: string
  icon: LucideIcon
  action: FeatureAction
  status: FeatureStatus
  shortcutDisplay: string | null
  onActivate: (action: FeatureAction) => void
}

export default function FeatureCard({
  title,
  description,
  icon: Icon,
  action,
  status,
  shortcutDisplay,
  onActivate,
}: FeatureCardProps) {
  const isComingSoon = status === 'coming-soon'
  const isAvailable = status === 'available'

  const handleActivate = () => {
    if (!isAvailable) return
    onActivate(action)
  }

  return (
    <Card
      size="sm"
      className={cn(
        'transition-colors',
        isAvailable && 'cursor-pointer hover:bg-muted/40',
        isComingSoon && 'opacity-70'
      )}
      onClick={isAvailable ? handleActivate : undefined}
      onKeyDown={(e) => {
        if (!isAvailable) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleActivate()
        }
      }}
      role={isAvailable ? 'button' : undefined}
      tabIndex={isAvailable ? 0 : undefined}
      aria-disabled={isComingSoon}
    >
      <CardHeader className="grid-cols-[auto_1fr] gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            isAvailable ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span className="truncate">{title}</span>
            {isComingSoon ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                即将推出
              </span>
            ) : null}
          </CardTitle>
          <CardDescription className="line-clamp-2 text-xs leading-relaxed">{description}</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {shortcutDisplay ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>快捷键</span>
            <ShortcutKbd formatted={shortcutDisplay} emptyMessage={null} className="text-[10px]" />
          </div>
        ) : null}
      </CardContent>

      {isAvailable ? (
        <CardFooter className="justify-end border-t-0 bg-transparent pt-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              handleActivate()
            }}
          >
            打开
            <ArrowRight className="size-3.5" aria-hidden />
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
