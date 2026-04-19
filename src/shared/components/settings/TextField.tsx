import { Label } from '@/shared/components/ui/label'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

type TextFieldProps = {
  id: string
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  type?: React.ComponentProps<'input'>['type']
  autoComplete?: string
  labelClassName?: string
  inputClassName?: string
  wrapperClassName?: string
}

export function TextField({
  id,
  label,
  value,
  onValueChange,
  placeholder,
  type = 'text',
  autoComplete = 'off',
  labelClassName = 'text-xs font-medium text-foreground',
  inputClassName,
  wrapperClassName,
}: TextFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        className={inputClassName}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
