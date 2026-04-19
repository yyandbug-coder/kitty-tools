import * as React from 'react'
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

const ScrollAreaRootBase = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    data-slot="scroll-area"
    className={cn('relative overflow-hidden', className)}
    {...props}
  />
))

ScrollAreaRootBase.displayName = 'ScrollAreaRootBase'

const ScrollAreaViewportBase = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ScrollAreaPrimitive.Viewport
    ref={ref}
    data-slot="scroll-area-viewport"
    className={cn(className)}
    {...props}
  />
))

ScrollAreaViewportBase.displayName = 'ScrollAreaViewportBase'

const ScrollAreaScrollbarBase = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    data-slot="scroll-area-scrollbar"
    data-orientation={orientation}
    orientation={orientation}
    className={cn(className)}
    {...props}
  />
))

ScrollAreaScrollbarBase.displayName = 'ScrollAreaScrollbarBase'

const ScrollAreaThumbBase = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaThumb>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaThumb>
>(({ className, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaThumb
    ref={ref}
    data-slot="scroll-area-thumb"
    className={cn(className)}
    {...props}
  />
))

ScrollAreaThumbBase.displayName = 'ScrollAreaThumbBase'

const ScrollAreaCornerBase = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Corner>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Corner>
>(({ className, ...props }, ref) => (
  <ScrollAreaPrimitive.Corner
    ref={ref}
    data-slot="scroll-area-corner"
    className={cn(className)}
    {...props}
  />
))

ScrollAreaCornerBase.displayName = 'ScrollAreaCornerBase'

export {
  ScrollAreaCornerBase,
  ScrollAreaRootBase,
  ScrollAreaScrollbarBase,
  ScrollAreaThumbBase,
  ScrollAreaViewportBase,
}
