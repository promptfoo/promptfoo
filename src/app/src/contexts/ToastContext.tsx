import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { AlertColor } from '@mui/material/Alert';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

interface ToastContextType {
  showToast: (message: string, severity?: AlertColor) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

interface ToastState {
  message: string;
  severity: AlertColor;
  open: boolean;
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toast, setToast] = useState<ToastState>({ message: '', severity: 'info', open: false });

  const showToast = (message: string, severity: AlertColor = 'info') => {
    setToast({ message, severity, open: true });
  };

  const handleClose = () => {
    setToast((prev) => ({ ...prev, open: false }));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Snackbar open={toast.open} autoHideDuration={6000} onClose={handleClose}>
        <Alert onClose={handleClose} severity={toast.severity}>
          {toast.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
};
