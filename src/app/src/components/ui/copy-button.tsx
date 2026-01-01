import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@app/lib/utils';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: string;
  title?: string;
}

export function CopyButton({ value, className, iconSize = 'h-3.5 w-3.5', title }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
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
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
        className,
      )}
      aria-label={copied ? 'Copied' : 'Copy'}
      title={title}
    >
      {copied ? (
        <Check className={cn(iconSize, 'text-emerald-600 dark:text-emerald-400')} />
      ) : (
        <Copy className={iconSize} />
      )}
    </button>
  );
}
