import React, { useState, type ReactNode } from 'react';
import { Snackbar, Alert, type AlertColor } from '@mui/material';
import { ToastContext } from './ToastContextDef';

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
        autoHideDuration={2000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={severity}
          sx={{
            boxShadow: (theme) => theme.shadows[3],
            maxWidth: '600px',
            whiteSpace: 'pre-line', // Preserves line breaks in the message
            width: '100%',
          }}
        >
          {message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};
