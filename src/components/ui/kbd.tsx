import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
        // 默认 tooltip：反色条（深底浅字）
        "in-data-[slot=tooltip-content]:in-data-[variant=default]:bg-background/20 in-data-[slot=tooltip-content]:in-data-[variant=default]:text-background dark:in-data-[slot=tooltip-content]:in-data-[variant=default]:bg-background/10",
        // rich tooltip：与 popover 正文一致，禁止沿用 text-background（浅色 popover 上会成白字）
        "in-data-[slot=tooltip-content]:in-data-[variant=rich]:bg-muted in-data-[slot=tooltip-content]:in-data-[variant=rich]:text-popover-foreground",
        "in-data-[slot=tooltip-content]:in-data-[variant=rich]:ring-1 in-data-[slot=tooltip-content]:in-data-[variant=rich]:ring-border/80",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
