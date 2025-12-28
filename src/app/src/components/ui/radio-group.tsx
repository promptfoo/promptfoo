import * as React from 'react';

import { cn } from '@app/lib/utils';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';

/**
 * RadioGroup - A set of checkable buttons where only one can be checked at a time.
 *
 * Built on Radix UI RadioGroup primitive with full keyboard navigation and accessibility.
 *
 * @example
 * // Basic usage
 * <RadioGroup value={value} onValueChange={setValue}>
 *   <div className="flex items-center gap-2">
 *     <RadioGroupItem value="option1" id="opt1" />
 *     <Label htmlFor="opt1">Option 1</Label>
 *   </div>
 *   <div className="flex items-center gap-2">
 *     <RadioGroupItem value="option2" id="opt2" />
 *     <Label htmlFor="opt2">Option 2</Label>
 *   </div>
 * </RadioGroup>
 *
 * @example
 * // Horizontal layout
 * <RadioGroup orientation="horizontal" value={value} onValueChange={setValue}>
 *   ...
 * </RadioGroup>
 *
 * @example
 * // With RadioGroupItemWithLabel for convenience
 * <RadioGroup value={value} onValueChange={setValue}>
 *   <RadioGroupItemWithLabel value="opt1" label="Option 1" />
 *   <RadioGroupItemWithLabel value="opt2" label="Option 2" description="With description" />
 * </RadioGroup>
 */

interface RadioGroupProps extends React.ComponentProps<typeof RadioGroupPrimitive.Root> {
  /**
   * The orientation of the radio group.
   * @default "vertical"
   */
  orientation?: 'horizontal' | 'vertical';
}

function RadioGroup({ className, orientation = 'vertical', ref, ...props }: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        'grid gap-2',
        orientation === 'horizontal' && 'grid-flow-col auto-cols-max gap-4',
        className,
      )}
      {...props}
      ref={ref}
    />
  );
}
RadioGroup.displayName = 'RadioGroup';

interface RadioGroupItemProps extends React.ComponentProps<typeof RadioGroupPrimitive.Item> {
  /**
   * Size variant of the radio button.
   * @default "default"
   */
  size?: 'sm' | 'default';
}

function RadioGroupItem({ className, size = 'default', ref, ...props }: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        // Base styles
        'aspect-square rounded-full border border-border bg-background',
        'ring-offset-background transition-colors',
        // Focus states
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Checked state
        'data-[state=checked]:border-primary data-[state=checked]:text-primary',
        // Hover state (only when not disabled)
        'hover:border-primary/50 hover:bg-muted/50',
        'data-[state=checked]:hover:bg-primary/5',
        // Size variants
        size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle
          className={cn(
            'fill-current text-primary',
            size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
          )}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
RadioGroupItem.displayName = 'RadioGroupItem';

/**
 * RadioGroupItemWithLabel - A convenience component that combines RadioGroupItem with a label.
 *
 * Provides a consistent layout for radio items with labels and optional descriptions.
 * Supports both compact and spacious layouts.
 */
interface RadioGroupItemWithLabelProps
  extends Omit<React.ComponentProps<typeof RadioGroupPrimitive.Item>, 'children'> {
  /**
   * The label text for the radio item.
   */
  label: React.ReactNode;
  /**
   * Optional description text shown below the label.
   */
  description?: React.ReactNode;
  /**
   * Size variant of the radio button.
   * @default "default"
   */
  size?: 'sm' | 'default';
  /**
   * Whether to use a card-style layout with border and padding.
   * Useful for larger, more prominent options.
   * @default false
   */
  variant?: 'default' | 'card';
}

function RadioGroupItemWithLabel({
  className,
  label,
  description,
  size = 'default',
  variant = 'default',
  value,
  disabled,
  ref,
  ...props
}: RadioGroupItemWithLabelProps) {
  const id = React.useId();

  if (variant === 'card') {
    return (
      <label
        htmlFor={id}
        className={cn(
          'flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4',
          'transition-colors hover:bg-muted/50',
          'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5',
          'has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50',
          className,
        )}
      >
        <RadioGroupItem
          ref={ref}
          id={id}
          value={value}
          size={size}
          disabled={disabled}
          className="mt-0.5 shrink-0"
          {...props}
        />
        <div className="grid gap-1">
          <span
            className={cn(
              'font-medium leading-none',
              size === 'sm' ? 'text-sm' : 'text-base',
            )}
          >
            {label}
          </span>
          {description && (
            <span className="text-sm text-muted-foreground leading-snug">{description}</span>
          )}
        </div>
      </label>
    );
  }

  return (
    <div className={cn('flex items-start gap-2', className)}>
      <RadioGroupItem
        ref={ref}
        id={id}
        value={value}
        size={size}
        disabled={disabled}
        className="mt-0.5 shrink-0"
        {...props}
      />
      <label
        htmlFor={id}
        className={cn(
          'grid gap-0.5 cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          className={cn(
            'font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          {label}
        </span>
        {description && (
          <span className="text-sm text-muted-foreground leading-snug">{description}</span>
        )}
      </label>
    </div>
  );
}
RadioGroupItemWithLabel.displayName = 'RadioGroupItemWithLabel';

export { RadioGroup, RadioGroupItem, RadioGroupItemWithLabel };
