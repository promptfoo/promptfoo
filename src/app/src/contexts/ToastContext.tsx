import React, { useCallback, useState } from 'react';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { ToastContext, type ToastProviderProps } from './ToastContextDef';
import type { AlertColor } from '@mui/material/Alert';

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<AlertColor>('info');
  const [duration, setDuration] = useState<number>(2000);

  const showToast = useCallback(
    (message: string, severity: AlertColor = 'info', duration: number = 2000) => {
      setMessage(message);
      setSeverity(severity);
      setDuration(duration);
      setOpen(true);
    },
    [],
  );

  const handleClose = useCallback((_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
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
    </ToastContext>
  );
};
