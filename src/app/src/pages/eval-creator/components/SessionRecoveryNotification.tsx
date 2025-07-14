import React, { useEffect, useState } from 'react';
import { Snackbar, Alert, AlertTitle } from '@mui/material';
import { useSessionRecovery } from '../hooks/useSessionRecovery';

export const SessionRecoveryNotification: React.FC = () => {
  const { hasRecoveredData, recoveredAt } = useSessionRecovery();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasRecoveredData && recoveredAt) {
      // Show notification after a brief delay to ensure the UI has loaded
      const timer = setTimeout(() => {
        setOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasRecoveredData, recoveredAt]);

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={handleClose} severity="info" variant="filled" sx={{ width: '100%' }}>
        <AlertTitle>Session Recovered</AlertTitle>
        Your previous work has been automatically restored.
      </Alert>
    </Snackbar>
  );
};
