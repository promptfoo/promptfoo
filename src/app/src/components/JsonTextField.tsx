import React from 'react';

import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

interface JsonTextFieldProps extends Omit<TextFieldProps, 'onChange' | 'value' | 'defaultValue'> {
  onChange?: (parsed: any, error?: string, raw?: string) => void;
  value?: string;
  defaultValue?: string;
  includeRaw?: boolean;
}

const JsonTextField: React.FC<JsonTextFieldProps> = ({
  onChange,
  value: controlledValue,
  defaultValue,
  includeRaw = false,
  ...props
}) => {
  // Determine if controlled at component initialization (never changes)
  const isControlled = React.useRef(controlledValue !== undefined);
  const [internalValue, setInternalValue] = React.useState<string>(defaultValue ?? '');
  const [error, setError] = React.useState(false);

  // Use controlled value if provided, otherwise use internal state
  const currentValue = isControlled.current ? (controlledValue ?? '') : internalValue;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    // Always update internal state for uncontrolled components
    if (!isControlled.current) {
      setInternalValue(newValue);
    }

    try {
      const parsed = JSON.parse(newValue);
      setError(false);
      onChange?.(parsed);
    } catch (_err) {
      setError(true);
      onChange?.(null, 'Invalid JSON');
    }
  };

  return (
    <TextField
      {...props}
      error={error}
      helperText={error ? 'Invalid JSON' : props.helperText}
      value={currentValue}
      onChange={handleChange}
    />
  );
};

export default JsonTextField;
