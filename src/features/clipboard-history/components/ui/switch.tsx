import { forwardRef } from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { Switch as SharedSwitch } from "@/shared/components/ui/switch"

const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentProps<typeof SharedSwitch>
>(({ size = "lg", ...props }, ref) => (
  <SharedSwitch ref={ref} size={size} {...props} />
))
Switch.displayName = "Switch"

export { Switch }
