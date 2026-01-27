import React from 'react';

import { HelperText } from '@app/components/ui/helper-text';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';

interface JsonTextFieldProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  onChange?: (parsed: unknown) => void;
  label?: string;
  helperText?: string;
}

const JsonTextField = ({
  onChange,
  label,
  helperText,
  className,
  ...props
}: JsonTextFieldProps) => {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState(false);
  const id = React.useId();

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.target.value;
    try {
      const parsed = JSON.parse(newValue);
      setValue(newValue);
      setError(false);
      if (onChange) {
        onChange(parsed);
      }
    } catch {
      setValue(newValue);
      setError(true);
    }
  };

  return (
    <div className="flex flex-col">
      {label && (
        <Label htmlFor={id} className={cn(error && 'text-destructive')}>
          {label}
        </Label>
      )}
      <Textarea
        id={id}
        value={value}
        onChange={handleChange}
        className={cn(error && 'border-destructive focus-visible:ring-destructive', className)}
        aria-invalid={error}
        {...props}
      />
      {(error || helperText) && (
        <HelperText error={error}>{error ? 'Invalid JSON' : helperText}</HelperText>
      )}
    </div>
  );
};

export default JsonTextField;
