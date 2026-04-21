import * as React from 'react';

import { cn } from '@app/lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';
import { Textarea } from './textarea';

interface JsonTextareaProps extends Omit<React.ComponentProps<'div'>, 'onChange' | 'defaultValue'> {
  label: string;
  defaultValue?: string;
  onChange?: (parsed: unknown) => void;
}

const JsonTextarea = ({
  label,
  defaultValue = '',
  onChange,
  className,
  ...props
}: JsonTextareaProps) => {
  const [value, setValue] = React.useState(defaultValue);
  const [error, setError] = React.useState(false);

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
    <div className={cn('flex flex-col', className)} {...props}>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={handleChange}
        className={cn('min-h-20 font-mono text-sm', error && 'border-destructive')}
      />
      {error && <HelperText error>Invalid JSON</HelperText>}
    </div>
  );
};

export { JsonTextarea };
