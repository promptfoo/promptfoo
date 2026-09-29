import * as React from 'react';

import { cn } from '@app/lib/utils';

export interface HelperTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** When true, displays in error/destructive styling */
  error?: boolean;
}

/**
 * HelperText displays supplementary information below form inputs.
 * Use for hints, validation messages, or additional context.
 */
function HelperText({ className, error, children, ...props }: HelperTextProps) {
  return (
    <p
      className={cn(
        'mt-1 text-xs',
        error ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </p>
  );
}

export { HelperText };
