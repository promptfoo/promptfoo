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
        'flex min-h-[80px] w-full rounded-lg border bg-background px-4 py-3',
        // Typography
        'text-sm leading-relaxed',
        // Border styling - softer default, more visible on hover/focus
        'border-input/60 hover:border-input',
        // Placeholder
        'placeholder:text-muted-foreground/60',
        // Focus state - subtle ring with smooth transition
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input/60',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Textarea };
