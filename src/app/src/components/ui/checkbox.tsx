import * as React from 'react';

import { cn } from '@app/lib/utils';
import { Check, Info, Minus } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  indeterminate?: boolean;
  ref?: React.Ref<HTMLInputElement>;
}

function Checkbox({ className, indeterminate, checked, ref, ...props }: CheckboxProps) {
  const innerRef = React.useRef<HTMLInputElement>(null);
  const resolvedRef = (ref as React.RefObject<HTMLInputElement>) || innerRef;

  React.useEffect(() => {
    if (resolvedRef.current) {
      resolvedRef.current.indeterminate = indeterminate ?? false;
    }
  }, [resolvedRef, indeterminate]);

  return (
    <label className="relative inline-flex items-center">
      <input
        type="checkbox"
        ref={resolvedRef}
        checked={checked}
        className="peer sr-only"
        {...props}
      />
      <div
        className={cn(
          'relative h-4 w-4 shrink-0 rounded border border-border cursor-pointer',
          'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          'peer-checked:bg-primary peer-checked:border-primary peer-checked:text-primary-foreground',
          'hover:border-primary/50 hover:bg-muted/50',
          'peer-checked:hover:bg-primary/90',
          'transition-colors',
          indeterminate && 'bg-primary border-primary text-primary-foreground',
          className,
        )}
      >
        {(indeterminate || checked) && (
          <span className="absolute inset-0 flex items-center justify-center">
            {indeterminate ? <Minus className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          </span>
        )}
      </div>
    </label>
  );
}

/**
 * CheckboxWithLabel - A convenience component that combines Checkbox with a label and optional tooltip.
 */
interface CheckboxWithLabelProps extends Omit<CheckboxProps, 'onChange' | 'size'> {
  /**
   * The label text for the checkbox.
   */
  label: React.ReactNode;
  /**
   * Optional tooltip text shown when hovering over an info icon.
   */
  tooltipText?: React.ReactNode;
  /**
   * Callback when checked state changes.
   */
  onChange?: (checked: boolean) => void;
  /**
   * Size variant of the component.
   * @default "default"
   */
  size?: 'sm' | 'default';
}

function CheckboxWithLabel({
  className,
  label,
  tooltipText,
  checked,
  onChange,
  disabled,
  size = 'default',
  ...props
}: CheckboxWithLabelProps) {
  const id = React.useId();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.checked);
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded px-1 -mx-1 py-1 transition-colors',
        !disabled && 'hover:bg-muted/50 cursor-pointer',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          id={id}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          {...props}
        />
      </div>
      <label
        htmlFor={id}
        className={cn(
          'flex-1 leading-none cursor-pointer select-none',
          size === 'sm' ? 'text-xs' : 'text-sm',
          disabled && 'cursor-not-allowed',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {label}
      </label>
      {tooltipText && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Info
              className={cn(
                'text-muted-foreground/40 hover:text-muted-foreground cursor-help transition-colors',
                size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
              )}
            />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export { Checkbox, CheckboxWithLabel };
