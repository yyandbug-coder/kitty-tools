import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"
import {
  ScrollAreaCornerBase,
  ScrollAreaRootBase,
  ScrollAreaScrollbarBase,
  ScrollAreaThumbBase,
  ScrollAreaViewportBase,
} from "@/shared/components/ui/base-scroll-area"
import { cn } from "@/shared/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaRootBase className={className} {...props}>
      <ScrollAreaViewportBase className="size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1">
        {children}
      </ScrollAreaViewportBase>
      {/* Radix 闇€鎸傝浇 Scrollbar 鎵嶈兘姝ｇ‘寤虹珛瑙嗗彛婊氬姩锛涢€忔槑涓斾笉鍗犱氦浜掞紝瑙嗚涓婄瓑鍚岄殣钘忔粴鍔ㄦ潯 */}
      <ScrollBar className="pointer-events-none opacity-0" />
      <ScrollAreaCornerBase className="pointer-events-none opacity-0" />
    </ScrollAreaRootBase>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaScrollbarBase
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaThumbBase className="relative flex-1 rounded-full bg-transparent" />
    </ScrollAreaScrollbarBase>
  )
}

export { ScrollArea, ScrollBar }
