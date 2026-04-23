// 密钥输入组件 - 默认密文，可通过按钮切换为明文
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SecretFieldProps {
  id: string
  label: string
  labelClassName?: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  inputClassName?: string
}

export default function SecretField({
  id,
  label,
  labelClassName = 'text-xs font-medium text-foreground',
  value,
  onValueChange,
  placeholder,
  inputClassName,
}: SecretFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="off"
          className={cn('pr-10', inputClassName)}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={placeholder}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2 shrink-0 text-muted-foreground"
              aria-label={visible ? '隐藏密钥' : '显示密钥'}
              aria-pressed={visible}
              onClick={() => setVisible((v) => !v)}
            >
              {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{visible ? '隐藏' : '显示'}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
