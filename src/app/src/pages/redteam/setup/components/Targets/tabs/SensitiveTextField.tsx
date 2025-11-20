import React from 'react';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField, { type TextFieldProps } from '@mui/material/TextField';

/**
 * A TextField component for sensitive input (passwords, passphrases, etc.)
 * with built-in visibility toggle functionality
 */
const SensitiveTextField: React.FC<TextFieldProps> = (props) => {
  const [showValue, setShowValue] = React.useState(false);

  return (
    <TextField
      {...props}
      type={showValue ? 'text' : 'password'}
      InputProps={{
        ...props.InputProps,
        endAdornment: (
          <InputAdornment position="end">
            {props.InputProps?.endAdornment}
            <IconButton
              aria-label="toggle password visibility"
              onClick={() => setShowValue(!showValue)}
              onMouseDown={(e) => e.preventDefault()}
              edge="end"
            >
              {showValue ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

export default SensitiveTextField;
