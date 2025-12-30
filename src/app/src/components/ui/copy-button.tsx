import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@app/lib/utils';
import { Check, Copy, X } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: string;
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({ value, className, iconSize = 'h-3.5 w-3.5' }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopyState('failed');
    }

    timeoutRef.current = setTimeout(() => {
      setCopyState('idle');
      timeoutRef.current = null;
    }, 2000);
  }, [value]);

  const ariaLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed to copy' : 'Copy';

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
        className,
      )}
      aria-label={ariaLabel}
    >
      {copyState === 'copied' ? (
        <Check className={cn(iconSize, 'text-emerald-600 dark:text-emerald-400')} />
      ) : copyState === 'failed' ? (
        <X className={cn(iconSize, 'text-red-600 dark:text-red-400')} />
      ) : (
        <Copy className={iconSize} />
      )}
    </button>
  );
}
