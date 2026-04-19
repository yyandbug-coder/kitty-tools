import { cn } from '@/shared/lib/utils'

type SettingsSectionTitleProps = {
  title: string
  description: string
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function SettingsSectionTitle({
  title,
  description,
  className,
  titleClassName,
  descriptionClassName,
}: SettingsSectionTitleProps) {
  return (
    <div className={className}>
      <p className={cn('text-sm font-medium text-foreground', titleClassName)}>{title}</p>
      <p className={cn('mt-1 text-xs leading-5 text-muted-foreground', descriptionClassName)}>
        {description}
      </p>
    </div>
  )
}
