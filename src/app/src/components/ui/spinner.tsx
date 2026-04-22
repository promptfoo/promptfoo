import * as React from 'react';

import { cn } from '@app/lib/utils';
import { Loader2 } from 'lucide-react';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  ref?: React.Ref<HTMLDivElement>;
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

function Spinner({ className, size = 'md', ref, ...props }: SpinnerProps) {
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label="Loading"
      className={cn('flex items-center justify-center', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size])} />
    </div>
  );
}

export { Spinner };
