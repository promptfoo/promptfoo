import { ToastContext } from '@app/contexts/ToastContextDef';
import { useContext } from 'react';

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
