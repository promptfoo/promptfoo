import { useCallback, useState } from 'react';

import { cn } from '@app/lib/utils';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: string;
}

export function CopyButton({ value, className, iconSize = 'h-3.5 w-3.5' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors',
        className,
      )}
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? (
        <Check className={cn(iconSize, 'text-emerald-600 dark:text-emerald-400')} />
      ) : (
        <Copy className={iconSize} />
      )}
    </button>
  );
}
