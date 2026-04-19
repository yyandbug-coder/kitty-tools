import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { ButtonBase } from '@/shared/components/ui/base-button'
import { cn } from '@/shared/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[color-mix(in_oklch,var(--secondary)_70%,transparent)] text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary)_88%,transparent)]',
        primary:
          'bg-[color-mix(in_oklch,var(--primary)_92%,transparent)] text-primary-foreground hover:bg-primary',
        ghost:
          'bg-transparent text-[color-mix(in_oklch,var(--foreground)_72%,transparent)] hover:bg-[color-mix(in_oklch,var(--accent)_34%,transparent)] hover:text-foreground',
        danger:
          'bg-[color-mix(in_oklch,var(--destructive)_16%,transparent)] text-destructive hover:bg-[color-mix(in_oklch,var(--destructive)_24%,transparent)]',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-xs',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <ButtonBase
      ref={ref}
      variant={variant}
      size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)

Button.displayName = 'Button'

export { Button }
