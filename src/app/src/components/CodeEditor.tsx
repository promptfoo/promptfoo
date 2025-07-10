import React from 'react';
import TextField from '@mui/material/TextField';
import { styled } from '@mui/material/styles';

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-root': {
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
    fontSize: '14px',
    lineHeight: '1.5',
  },
  '& .MuiInputBase-input': {
    padding: theme.spacing(1.5),
  },
}));

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  disabled,
}: CodeEditorProps) {
  return (
    <StyledTextField
      value={value}
      onChange={(e) => onChange(e.target.value)}
      multiline
      fullWidth
      variant="outlined"
      placeholder={placeholder || `Enter your ${language || 'code'} here...`}
      disabled={disabled}
      sx={{ height: '100%' }}
      InputProps={{
        sx: {
          height: '100%',
          alignItems: 'flex-start',
        },
      }}
    />
  );
}
