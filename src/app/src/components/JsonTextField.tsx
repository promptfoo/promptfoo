import React from 'react';

import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

interface JsonTextFieldProps extends Omit<TextFieldProps, 'onChange'> {
  onChange?: (parsed: any) => void;
}

const JsonTextField: React.FC<JsonTextFieldProps> = ({ onChange, defaultValue, ...props }) => {
  const [value, setValue] = React.useState(defaultValue || '');
  const [error, setError] = React.useState(false);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
