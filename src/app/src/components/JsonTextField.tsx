import React from 'react';

import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

interface JsonTextFieldProps extends Omit<TextFieldProps, 'onChange'> {
  onChange?: (parsed: any, error?: string) => void;
}

const JsonTextField: React.FC<JsonTextFieldProps> = ({ onChange, defaultValue, ...props }) => {
  const [value, setValue] = React.useState(defaultValue || '');
  const [error, setError] = React.useState(false);

  // CRITICAL FIX #1: Sync state when defaultValue changes
  React.useEffect(() => {
    setValue(defaultValue || '');
  }, [defaultValue]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setValue(newValue);

    try {
      const parsed = JSON.parse(newValue);
      setError(false);
      if (onChange) {
        onChange(parsed);
      }
    } catch (_err) {
      setError(true);
      if (onChange) {
        onChange(null, 'Invalid JSON');
      }
    }
  };

  return (
    <TextField
      {...props}
      error={error}
      helperText={error ? 'Invalid JSON' : props.helperText}
      value={value}
      onChange={handleChange}
    />
  );
};

export default JsonTextField;
