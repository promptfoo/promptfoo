import * as React from 'react';

import { cn } from '@app/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 flex items-center gap-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-background text-foreground [&>svg]:text-foreground',
        destructive:
          'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        warning:
          'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-500',
        info: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  ref?: React.Ref<HTMLDivElement>;
  onDismiss?: () => void;
  dismissLabel?: string;
}

function Alert({
  className,
  variant,
  ref,
  onDismiss,
  dismissLabel = 'Dismiss',
  ...props
}: AlertProps) {
  return (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {props.children}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 cursor-pointer rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
          aria-label={dismissLabel}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function AlertTitle({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h5
      ref={ref}
      className={cn('mb-1 font-medium leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <div
      ref={ref}
      className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)}
      {...props}
    />
  );
}

function AlertContent({
  className,
  ref,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn('flex-1', className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, AlertContent };
