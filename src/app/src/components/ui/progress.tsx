import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as ProgressPrimitive from '@radix-ui/react-progress';

interface ProgressProps extends React.ComponentProps<typeof ProgressPrimitive.Root> {
  indeterminate?: boolean;
}

function Progress({ className, value, indeterminate, ref, ...props }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          'size-full flex-1 bg-primary',
          indeterminate
            ? 'animate-[indeterminate_1.5s_ease-in-out_infinite] w-1/3'
            : 'transition-all',
        )}
        style={indeterminate ? undefined : { transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
