import * as React from 'react'
import { Slot } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

export type ButtonBaseProps = React.ComponentPropsWithoutRef<'button'> & {
  asChild?: boolean
  variant?: string | null
  size?: string | null
}

const ButtonBase = React.forwardRef<HTMLButtonElement, ButtonBaseProps>(
  ({ asChild = false, className, variant, size, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'

    return (
      <Comp
        ref={ref as never}
        data-slot="button"
        data-variant={variant ?? undefined}
        data-size={size ?? undefined}
        className={cn(className)}
        {...props}
      />
    )
  },
)

ButtonBase.displayName = 'ButtonBase'

export { ButtonBase }
