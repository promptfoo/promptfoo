import * as React from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground border-border',
        // Severity variants - soft, muted colors
        critical: 'border-transparent bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
        high: 'border-transparent bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400',
        // Note: 'medium' is used for risk severity levels in security contexts
        medium:
          'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
        low: 'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        info: 'border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
        success:
          'border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        // Note: 'warning' has identical styling to 'medium' but is used for general UI warnings vs risk severity
        warning:
          'border-transparent bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** When true, the badge will shrink to fit its container and truncate text with ellipsis */
  truncate?: boolean;
}

function Badge({ className, variant, truncate, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant }), truncate && 'max-w-full min-w-0', className)}
      {...props}
    >
      {truncate ? <span className="truncate">{children}</span> : children}
    </div>
  );
}

export { Badge, badgeVariants };
