import * as React from 'react';
import { useCallback } from 'react';

import { useCopyFeedback } from '@app/hooks/useCopyFeedback';
import { cn } from '@app/lib/utils';
import { Check, Copy } from 'lucide-react';

interface CopyButtonProps extends Omit<React.ComponentProps<'button'>, 'value'> {
  value: string;
  iconSize?: string;
  title?: string;
}

export function CopyButton({
  value,
  className,
  iconSize = 'h-3.5 w-3.5',
  ...props
}: CopyButtonProps) {
  const [copied, showCopied] = useCopyFeedback(2000);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      showCopied();
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [value, showCopied]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer',
        className,
      )}
      aria-label={copied ? 'Copied' : 'Copy'}
      {...props}
    >
      {copied ? (
        <Check className={cn(iconSize, 'text-emerald-600 dark:text-emerald-400')} />
      ) : (
        <Copy className={iconSize} />
      )}
    </button>
  );
}
