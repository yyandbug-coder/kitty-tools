import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Switch as SwitchPrimitive } from "radix-ui"
import { SwitchBase } from "@/shared/components/ui/base-switch"
import { cn } from "@/shared/lib/utils"

const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default:
          "h-[1.15rem] w-8 shadow-xs focus-visible:border-ring focus-visible:ring-[3px] data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        lg: "h-6 w-11 border-2 focus-visible:ring-2 data-[state=checked]:bg-primary/82 data-[state=unchecked]:bg-secondary/62",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background ring-0 transition-transform",
  {
    variants: {
      size: {
        default: "size-4 data-[state=checked]:translate-x-3 data-[state=unchecked]:translate-x-0",
        lg: "size-5 shadow-sm data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Switch({
  className,
  size,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> &
  VariantProps<typeof switchVariants>) {
  return (
    <SwitchBase
      className={cn(switchVariants({ size }), className)}
      thumbClassName={cn(switchThumbVariants({ size }))}
      {...props}
    />
  )
}

export { Switch, switchVariants }
