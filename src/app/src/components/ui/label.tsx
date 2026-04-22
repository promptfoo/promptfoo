import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cva, type VariantProps } from 'class-variance-authority';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      inline: {
        true: '',
        false: 'mb-2',
      },
    },
    defaultVariants: {
      inline: false,
    },
  },
);

function Label({
  className,
  ref,
  inline,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & VariantProps<typeof labelVariants>) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelVariants({ inline }), className)}
      {...props}
    />
  );
}

export { Label };
