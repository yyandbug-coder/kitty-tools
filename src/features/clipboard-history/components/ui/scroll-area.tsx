import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import {
  ScrollAreaCornerBase,
  ScrollAreaRootBase,
  ScrollAreaScrollbarBase,
  ScrollAreaThumbBase,
  ScrollAreaViewportBase,
} from "@/shared/components/ui/base-scroll-area"

import { cn } from "@/shared/lib/utils"

const ScrollArea = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaRootBase
    ref={ref}
    className={className}
    {...props}
  >
    <ScrollAreaViewportBase
      className={cn(
        'h-full w-full rounded-[inherit] no-scrollbar',
        '[scrollbar-width:none] [-ms-overflow-style:none]',
        '[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:size-0',
      )}
    >
      {children}
    </ScrollAreaViewportBase>
    <ScrollBar className="!hidden size-0 min-h-0 min-w-0 border-0 p-0" />
    <ScrollAreaCornerBase className="hidden size-0" />
  </ScrollAreaRootBase>
))
ScrollArea.displayName = 'ScrollArea'

const ScrollBar = React.forwardRef<
  React.ComponentRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaScrollbarBase
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2 border-l border-l-transparent p-px",
      orientation === "horizontal" &&
        "h-2 flex-col border-t border-t-transparent p-px",
      className
    )}
    {...props}
  >
    <ScrollAreaThumbBase className="relative flex-1 rounded-full bg-border/50" />
  </ScrollAreaScrollbarBase>
))
ScrollBar.displayName = 'ScrollBar'

export { ScrollArea }
