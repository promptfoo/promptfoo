import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

const Collapsible = CollapsiblePrimitive.Root;

function CollapsibleTrigger({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      ref={ref}
      className={cn('cursor-pointer disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
