import * as React from "react"

import { cn } from "@translate/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "scrollbar-none flex field-sizing-content min-h-16 w-full rounded-lg border border-[color-mix(in_oklch,var(--border)_40%,transparent)] bg-[color-mix(in_oklch,var(--background)_72%,transparent)] px-2.5 py-2 text-base transition-[border-color,background-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-[color-mix(in_oklch,var(--secondary)_58%,transparent)] disabled:opacity-50 aria-invalid:border-[color-mix(in_oklch,var(--destructive)_40%,transparent)] aria-invalid:ring-3 aria-invalid:ring-[color-mix(in_oklch,var(--destructive)_22%,transparent)] md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
