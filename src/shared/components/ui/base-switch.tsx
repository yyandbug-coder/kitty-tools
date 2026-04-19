import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

export type SwitchBaseProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  thumbClassName?: string
}

const SwitchBase = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  SwitchBaseProps
>(({ className, thumbClassName, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    data-slot="switch"
    className={cn(className)}
    {...props}
  >
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(thumbClassName)}
    />
  </SwitchPrimitive.Root>
))

SwitchBase.displayName = 'SwitchBase'

export { SwitchBase }
