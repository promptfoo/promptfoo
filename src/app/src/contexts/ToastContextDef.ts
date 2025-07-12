import { createContext } from 'react';
import type { AlertColor } from '@mui/material/Alert';

export interface ToastContextType {
  showToast: (message: string, severity?: AlertColor) => void;
}

export interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
