import React, { useCallback, useState } from 'react';

import { cn } from '@app/lib/utils';
import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { ToastContext, type ToastProviderProps, type ToastSeverity } from './ToastContextDef';

const severityStyles: Record<ToastSeverity, { bg: string; icon: React.ElementType }> = {
  success: {
    bg: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100',
    icon: CheckCircle,
  },
  error: {
    bg: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
    icon: AlertCircle,
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100',
    icon: Info,
  },
};

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<ToastSeverity>('info');
  const [duration, setDuration] = useState<number>(2000);

  const showToast = useCallback(
    (message: string, severity: ToastSeverity = 'info', duration: number = 2000) => {
      setMessage(message);
      setSeverity(severity);
      setDuration(duration);
      setOpen(true);
    },
    [],
  );

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Auto-close timer
  React.useEffect(() => {
    if (open && duration > 0) {
      const timer = setTimeout(() => {
        setOpen(false);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [open, duration]);

  const { bg, icon: Icon } = severityStyles[severity];

  return (
    <ToastContext value={{ showToast }}>
      {children}
      {/* Toast notification */}
      <div
        className={cn(
          'fixed top-4 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300',
          open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
        )}
        role="alert"
        aria-live="polite"
      >
        <div
          className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg max-w-xl',
            bg,
          )}
        >
          <Icon className="h-5 w-5 shrink-0" />
          <p className="text-sm whitespace-pre-line flex-1">{message}</p>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </ToastContext>
  );
};
