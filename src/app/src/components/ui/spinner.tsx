import * as React from 'react';

import { cn } from '@app/lib/utils';
import { Loader2 } from 'lucide-react';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center justify-center', className)} {...props}>
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size])} />
    </div>
  ),
);
Spinner.displayName = 'Spinner';

export { Spinner };
