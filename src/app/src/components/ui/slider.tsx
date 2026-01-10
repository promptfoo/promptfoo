import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as SliderPrimitive from '@radix-ui/react-slider';

function Slider({
  className,
  ref,
  'aria-labelledby': ariaLabelledby,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      aria-labelledby={ariaLabelledby}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/10 cursor-pointer"
        aria-labelledby={ariaLabelledby}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
