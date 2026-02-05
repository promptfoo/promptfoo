import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 4,
  ref,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-(--z-tooltip) overflow-hidden rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-100',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

const TooltipArrow = TooltipPrimitive.Arrow;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipArrow };
