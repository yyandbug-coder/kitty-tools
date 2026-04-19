import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

type SettingsControlRowProps = {
  title: string
  description: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  controlClassName?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function SettingsControlRow({
  title,
  description,
  children,
  className,
  contentClassName,
  controlClassName,
  titleClassName,
  descriptionClassName,
}: SettingsControlRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-2xl px-4 py-3', className)}>
      <div className={cn('min-w-0 flex-1', contentClassName)}>
        <p className={cn('text-sm font-medium text-foreground', titleClassName)}>{title}</p>
        <div className={cn('mt-1 text-xs leading-5 text-muted-foreground', descriptionClassName)}>
          {description}
        </div>
      </div>
      <div className={cn('shrink-0', controlClassName)}>{children}</div>
    </div>
  )
}
