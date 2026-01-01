import * as React from 'react';

import { cn } from '@app/lib/utils';
import { Label } from './label';
import { Textarea } from './textarea';

interface JsonTextareaProps {
  label: string;
  defaultValue?: string;
  onChange?: (parsed: unknown) => void;
  className?: string;
}

const JsonTextarea = ({ label, defaultValue = '', onChange, className }: JsonTextareaProps) => {
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
    <div className={cn('space-y-2', className)}>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={handleChange}
        className={cn('min-h-20 font-mono text-sm', error && 'border-destructive')}
      />
      {error && <p className="text-sm text-destructive">Invalid JSON</p>}
    </div>
  );
};

export { JsonTextarea };
