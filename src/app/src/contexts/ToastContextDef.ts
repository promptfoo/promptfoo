import { createContext } from 'react';
import type { PropsWithChildren } from 'react';

export type ToastSeverity = 'success' | 'error' | 'warning' | 'info';

interface ToastContextType {
  showToast: (message: string, severity?: ToastSeverity, duration?: number) => void;
}

export type ToastProviderProps = PropsWithChildren;

export const ToastContext = createContext<ToastContextType | undefined>(undefined);
