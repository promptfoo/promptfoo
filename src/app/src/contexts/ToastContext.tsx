import React, { useState, type ReactNode } from 'react';
import { Snackbar, Alert, type AlertColor } from '@mui/material';
import { ToastContext } from './ToastContextDef';

// Define default durations (in milliseconds) for different severities
const DURATIONS = {
  error: 8000, // 8 seconds for errors
  warning: 6000, // 6 seconds for warnings
  info: 2000, // 2 seconds for info
  success: 2000, // 2 seconds for success
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('info');

  const showToast = (message: string, severity: AlertColor = 'info') => {
    setMessage(message);
    setSeverity(severity);
    setOpen(true);
  };

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={DURATIONS[severity]}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={severity}
          sx={{
            width: '100%',
            maxWidth: '600px',
            boxShadow: (theme) => theme.shadows[3],
            whiteSpace: 'pre-line', // Preserves line breaks in the message
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};
