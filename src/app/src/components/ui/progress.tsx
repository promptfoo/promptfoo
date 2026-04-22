import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as ProgressPrimitive from '@radix-ui/react-progress';

function Progress({
  className,
  value,
  ref,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
