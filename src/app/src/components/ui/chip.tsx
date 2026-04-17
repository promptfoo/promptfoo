import * as React from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const chipVariants = cva(
  'inline-flex items-center h-8 border border-input rounded-md px-3 bg-white dark:bg-zinc-900 transition-colors',
  {
    variants: {
      interactive: {
        true: 'cursor-pointer hover:bg-muted/50',
        false: 'cursor-default',
      },
    },
    defaultVariants: {
      interactive: true,
    },
  },
);

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof chipVariants> {
  /** The label displayed as a prefix (e.g., "EVAL", "ID", "AUTHOR") */
  label: string;
  /** Optional icon or element displayed after the content */
  trailingIcon?: React.ReactNode;
}

function Chip({
  className,
  label,
  children,
  trailingIcon,
  interactive = true,
  disabled,
  ...props
}: ChipProps) {
  const isInteractive = interactive && !disabled;

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(chipVariants({ interactive: isInteractive }), className)}
      {...props}
    >
      <span className="text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>{' '}
        {children}
      </span>
      {trailingIcon && <span className="ml-2 shrink-0">{trailingIcon}</span>}
    </button>
  );
}

export { Chip, chipVariants };
