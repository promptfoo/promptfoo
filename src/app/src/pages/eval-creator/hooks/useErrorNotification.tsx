import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertTitle, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

interface ErrorNotification {
  id: string;
  message: string;
  title?: string;
  severity?: 'error' | 'warning' | 'info' | 'success';
}

interface ErrorNotificationContextType {
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
}

const ErrorNotificationContext = createContext<ErrorNotificationContextType | undefined>(undefined);

export const useErrorNotification = () => {
  const context = useContext(ErrorNotificationContext);
  if (!context) {
    throw new Error('useErrorNotification must be used within ErrorNotificationProvider');
  }
  return context;
};

export const ErrorNotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);

  const showNotification = useCallback(
    (message: string, title?: string, severity: ErrorNotification['severity'] = 'error') => {
      const id = Date.now().toString();
      setNotifications((prev) => [...prev, { id, message, title, severity }]);

      // Auto-dismiss after 6 seconds for non-error notifications
      if (severity !== 'error') {
        setTimeout(() => {
          setNotifications((prev) => prev.filter((n) => n.id !== id));
        }, 6000);
      }
    },
    [],
  );

  const showError = useCallback(
    (message: string, title?: string) => {
      showNotification(message, title, 'error');
    },
    [showNotification],
  );

  const showWarning = useCallback(
    (message: string, title?: string) => {
      showNotification(message, title, 'warning');
    },
    [showNotification],
  );

  const showInfo = useCallback(
    (message: string, title?: string) => {
      showNotification(message, title, 'info');
    },
    [showNotification],
  );

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      showNotification(message, title, 'success');
    },
    [showNotification],
  );

  const handleClose = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <ErrorNotificationContext.Provider value={{ showError, showWarning, showInfo, showSuccess }}>
      {children}
      {notifications.map((notification, index) => (
        <Snackbar
          key={notification.id}
          open={true}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          style={{ top: 20 + index * 80 }}
        >
          <Alert
            severity={notification.severity}
            variant="filled"
            action={
              <IconButton
                size="small"
                aria-label="close"
                color="inherit"
                onClick={() => handleClose(notification.id)}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            {notification.title && <AlertTitle>{notification.title}</AlertTitle>}
            {notification.message}
          </Alert>
        </Snackbar>
      ))}
    </ErrorNotificationContext.Provider>
  );
};
