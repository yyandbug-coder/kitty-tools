import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/shared/lib/utils'

type TabsVariant = string | null | undefined

function TabsBase({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(className)}
      {...props}
    />
  )
}

function TabsListBase({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: TabsVariant }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant ?? undefined}
      className={cn(className)}
      {...props}
    />
  )
}

function TabsTriggerBase({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn(className)} {...props} />
}

function TabsContentBase({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn(className)} {...props} />
}

export { TabsBase, TabsListBase, TabsTriggerBase, TabsContentBase }
