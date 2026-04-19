import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { ButtonBase } from '@/shared/components/ui/base-button'
import { cn } from '@/shared/lib/utils'

type SecretFieldProps = {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  inputClassName: string
  labelClassName?: string
  wrapperClassName?: string
  toggleButtonClassName?: string
  showLabel?: string
  hideLabel?: string
}

export function SecretField({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  inputClassName,
  labelClassName = 'text-xs font-medium text-foreground',
  wrapperClassName,
  toggleButtonClassName,
  showLabel = '显示',
  hideLabel = '隐藏',
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          className={cn(inputClassName, 'pr-10')}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
        />
        <ButtonBase
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'absolute right-0.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--accent)_34%,transparent)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            toggleButtonClassName,
          )}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          title={visible ? hideLabel : showLabel}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </ButtonBase>
      </div>
    </div>
  )
}
