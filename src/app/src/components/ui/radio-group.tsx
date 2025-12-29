import * as React from 'react';

import { cn } from '@app/lib/utils';

interface RadioGroupContextValue {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

function useRadioGroup() {
  const context = React.useContext(RadioGroupContext);
  if (!context) {
    throw new Error('RadioGroupItem must be used within a RadioGroup');
  }
  return context;
}

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
}

function RadioGroup({
  className,
  value,
  defaultValue,
  onValueChange,
  name,
  children,
  ...props
}: RadioGroupProps) {
  const generatedName = React.useId();
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');

  const currentValue = value ?? internalValue;

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [value, onValueChange],
  );

  return (
    <RadioGroupContext.Provider
      value={{
        name: name ?? generatedName,
        value: currentValue,
        onValueChange: handleValueChange,
      }}
    >
      <div role="radiogroup" className={cn('grid gap-2', className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioGroupItemProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
}

function RadioGroupItem({
  className,
  value,
  id,
  disabled,
  children,
  ...props
}: RadioGroupItemProps) {
  const { name, value: groupValue, onValueChange } = useRadioGroup();
  const isChecked = groupValue === value;

  return (
    <label htmlFor={id} className="relative inline-flex items-center gap-2 cursor-pointer">
      <input
        type="radio"
        id={id}
        name={name}
        value={value}
        checked={isChecked}
        disabled={disabled}
        className="peer sr-only"
        onChange={() => onValueChange(value)}
        {...props}
      />
      <div
        className={cn(
          'aspect-square h-4 w-4 shrink-0 rounded-full border border-border',
          'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          'hover:border-primary/50 hover:bg-muted/50',
          'transition-colors',
          isChecked && 'border-primary',
          className,
        )}
      >
        {isChecked && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        )}
      </div>
      {children && <span>{children}</span>}
    </label>
  );
}

export { RadioGroup, RadioGroupItem };
