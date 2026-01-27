import * as React from 'react';

import { cn } from '@app/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: React.Ref<HTMLTextAreaElement>;
}

function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        // Base layout and sizing
        'flex min-h-20 w-full rounded-md border px-3 py-2',
        // Background - solid colors to match Input component
        'bg-white dark:bg-zinc-900',
        // Typography
        'text-sm leading-relaxed',
        // Border styling - consistent with input
        'border-input hover:border-primary/50',
        // Placeholder
        'placeholder:text-muted-foreground',
        // Focus state
        'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Textarea };
