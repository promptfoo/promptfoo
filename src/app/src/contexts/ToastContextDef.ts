import { createContext } from 'react';
import type { AlertColor } from '@mui/material/Alert';
import type { PropsWithChildren } from 'react';

interface ToastContextType {
  showToast: (message: string, severity?: AlertColor) => void;
}

export type ToastProviderProps = PropsWithChildren;

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
