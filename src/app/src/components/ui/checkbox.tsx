import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps
  extends Omit<React.ComponentProps<typeof CheckboxPrimitive.Root>, 'onChange'> {
  indeterminate?: boolean;
  onChange?: (event: { target: { checked: boolean } }) => void;
}

function Checkbox({
  className,
  indeterminate,
  checked,
  onCheckedChange,
  onChange,
  onClick,
  ref,
  ...props
}: CheckboxProps) {
  // Handle both onCheckedChange and onChange callbacks
  const handleCheckedChange = (newChecked: boolean | 'indeterminate') => {
    const isChecked = newChecked === true;
    onCheckedChange?.(newChecked);
    onChange?.({ target: { checked: isChecked } });
  };

  // Stop propagation to prevent double-toggle in tables
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClick?.(e);
  };

  // Radix uses 'indeterminate' as a checked value
  const checkedValue = indeterminate ? 'indeterminate' : checked;

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={checkedValue}
      onCheckedChange={handleCheckedChange}
      onClick={handleClick}
      className={cn(
        'peer size-4 shrink-0 rounded border border-border cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground',
        'hover:border-primary/50 hover:bg-muted/50',
        'data-[state=checked]:hover:bg-primary/90',
        'data-[state=indeterminate]:hover:bg-primary/90',
        'transition-colors',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {indeterminate ? <Minus className="size-3" /> : <Check className="size-3" />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
