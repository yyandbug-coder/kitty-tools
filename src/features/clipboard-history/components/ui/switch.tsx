import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'
import { SwitchBase } from '@/shared/components/ui/base-switch'
import { cn } from '@/shared/lib/utils'

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchBase
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary/82 data-[state=unchecked]:bg-secondary/62',
      className,
    )}
    thumbClassName={cn(
      'pointer-events-none block size-5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5',
    )}
    {...props}
  />
))
Switch.displayName = 'Switch'

export { Switch }
