import * as React from 'react';

import { cn } from '@app/lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';

export type NumberInputChangeFn = (value?: number) => void;

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  /** onChange passes the numeric value of the field (or undefined if empty). */
  onChange: NumberInputChangeFn;

  /** min provides the minimum allowable value for the input. */
  min?: number;

  /** max provides the maximum allowable value for the input. */
  max?: number;

  /** allowDecimals determines whether decimal/float values are allowed. Default is false. */
  allowDecimals?: boolean;

  /** step controls the increment/decrement amount when using arrow keys. Default is 1. */
  step?: number;

  /** Label text or element displayed above the input. */
  label?: React.ReactNode;

  /** Helper text displayed below the input. */
  helperText?: React.ReactNode;

  /** Error state - when true or a string, shows error styling. */
  error?: boolean | string;

  /** When true, the input takes full width of its container. */
  fullWidth?: boolean;

  /** Content to display at the end of the input (e.g., units like "ms"). */
  endAdornment?: React.ReactNode;
}

/**
 * NumberInput handles numeric inputs with value parsing, key filtering, and scroll prevention.
 * This is a non-MUI replacement for BaseNumberInput.
 */
function NumberInput({
  onChange,
  value,
  min,
  max,
  allowDecimals = false,
  step = 1,
  label,
  helperText,
  error,
  fullWidth,
  endAdornment,
  className,
  disabled,
  readOnly,
  id,
  onKeyDown,
  ...props
}: NumberInputProps) {
  const inputId = id || React.useId();
  const inputMode = allowDecimals ? 'decimal' : 'numeric';
  const pattern = allowDecimals ? '[0-9]*\\.?[0-9]*' : '[0-9]*';

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (evt) => {
    if (readOnly) {
      return;
    }
    const raw = evt.target.value;
    const numericValue = raw === '' ? undefined : Number(raw);
    onChange(numericValue);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (readOnly) {
      onKeyDown?.(e);
      return;
    }

    const shouldIgnoreDecimals = inputMode === 'numeric';
    const blockedKeys = shouldIgnoreDecimals ? ['e', 'E', '+', '.'] : ['e', 'E', '+'];

    if (blockedKeys.includes(e.key) || (min !== undefined && min >= 0 && e.key === '-')) {
      e.preventDefault();
    }

    onKeyDown?.(e);
  };

  const handleWheel: React.WheelEventHandler<HTMLInputElement> = (e) => {
    (e.target as HTMLElement).blur();
  };

  const hasError = Boolean(error);
  const errorMessage = typeof error === 'string' ? error : undefined;

  return (
    <div className={cn('flex flex-col', fullWidth && 'w-full')}>
      {label && (
        <Label
          htmlFor={inputId}
          className={cn(hasError && 'text-destructive', disabled && 'opacity-50')}
        >
          {label}
        </Label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="number"
          value={value ?? ''}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          inputMode={inputMode}
          pattern={pattern}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={hasError}
          className={cn(
            'flex h-10 w-full rounded-md border bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-foreground ring-offset-background',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            hasError ? 'border-destructive focus-visible:ring-destructive' : 'border-input',
            endAdornment && 'pr-12',
            className,
          )}
          {...props}
        />
        {endAdornment && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            {endAdornment}
          </div>
        )}
      </div>
      {(helperText || errorMessage) && (
        <HelperText error={hasError} className={cn(disabled && 'opacity-50')}>
          {errorMessage || helperText}
        </HelperText>
      )}
    </div>
  );
}

export { NumberInput };
