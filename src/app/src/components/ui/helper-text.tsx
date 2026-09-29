import * as React from 'react';

import { cn } from '@app/lib/utils';

export interface HelperTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** When true, displays in error/destructive styling */
  error?: boolean;
}

/** Displays input hints or validation messages; errors are announced by default. */
function HelperText({ className, error, children, role, ...props }: HelperTextProps) {
  return (
    <p
      role={role ?? (error ? 'alert' : undefined)}
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
