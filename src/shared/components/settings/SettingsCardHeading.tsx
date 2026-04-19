import type { ReactNode } from 'react'
import { CardHeader, CardTitle } from '@translate/components/ui/card'
import { cn } from '@/shared/lib/utils'

type SettingsCardHeadingProps = {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  className?: string
  headerClassName?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function SettingsCardHeading({
  icon,
  title,
  description,
  className,
  headerClassName = 'pb-3',
  titleClassName,
  descriptionClassName,
}: SettingsCardHeadingProps) {
  return (
    <CardHeader className={cn(headerClassName, className)}>
      <CardTitle className={cn('flex items-center gap-2 text-sm font-medium', titleClassName)}>
        {icon}
        {title}
      </CardTitle>
      {description ? (
        <div className={cn('text-xs leading-relaxed text-muted-foreground', descriptionClassName)}>
          {description}
        </div>
      ) : null}
    </CardHeader>
  )
}
