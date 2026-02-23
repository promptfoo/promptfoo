import * as React from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const chipVariants = cva(
  'inline-flex items-center h-8 border border-input rounded-md overflow-hidden bg-white dark:bg-zinc-900 transition-colors no-underline',
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2.5 self-stretch inline-flex items-center bg-muted/50 dark:bg-muted/30">
        {label}
      </span>
      <span className="text-xs font-medium px-2.5 self-stretch inline-flex items-center border-l border-input select-text">
        {children}
      </span>
      {trailingIcon && (
        <span className="px-2 shrink-0 self-stretch inline-flex items-center">{trailingIcon}</span>
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
