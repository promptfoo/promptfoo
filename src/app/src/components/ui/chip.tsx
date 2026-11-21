import * as React from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const chipVariants = cva(
  'inline-flex max-w-full items-center h-7 rounded-md overflow-hidden bg-transparent transition-colors no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

type ChipBaseProps = VariantProps<typeof chipVariants> & {
  /** The label displayed as a prefix (e.g., "EVAL", "ID", "AUTHOR") */
  label: string;
  /** Optional icon or element displayed after the content */
  trailingIcon?: React.ReactNode;
};

export type ChipProps = ChipBaseProps &
  (
    | ({ href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof ChipBaseProps>)
    | ({ href?: never } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof ChipBaseProps>)
  );

function Chip({
  className,
  label,
  children,
  trailingIcon,
  interactive = true,
  ...props
}: ChipProps) {
  const isLink = 'href' in props && props.href != null;
  const disabled =
    !isLink && 'disabled' in props ? (props as { disabled?: boolean }).disabled : false;
  const isInteractive = (isLink || interactive) && !disabled;

  const inner = (
    <>
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground pl-1 pr-1.5 self-stretch inline-flex items-center shrink-0">
        {label}
      </span>
      <span className="text-xs font-medium pr-1 self-stretch inline-flex items-center min-w-0 truncate select-text">
        {children}
      </span>
      {trailingIcon && (
        <span className="px-1 shrink-0 self-stretch inline-flex items-center">{trailingIcon}</span>
      )}
    </>
  );

  const sharedClassName = cn(chipVariants({ interactive: isInteractive }), 'p-0 gap-0', className);

  if (isLink) {
    const {
      href,
      interactive: _,
      ...anchorProps
    } = props as {
      href: string;
      interactive?: boolean;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a href={href} className={sharedClassName} {...anchorProps}>
        {inner}
      </a>
    );
  }

  const { interactive: _, ...buttonProps } = props as {
    interactive?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" disabled={disabled} className={sharedClassName} {...buttonProps}>
      {inner}
    </button>
  );
}

export { Chip, chipVariants };
