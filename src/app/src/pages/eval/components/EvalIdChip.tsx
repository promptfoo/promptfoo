import { useCallback, useEffect, useRef, useState } from 'react';

import { Chip } from '@app/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Check, Copy } from 'lucide-react';

interface EvalIdChipProps {
  evalId: string;
  onCopy: () => void;
}

export const EvalIdChip = ({ evalId, onCopy }: EvalIdChipProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(() => {
    onCopy();
    setCopied(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      timeoutRef.current = null;
    }, 2000);
  }, [onCopy]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Chip
          label="ID"
          onClick={handleCopy}
          trailingIcon={
            copied ? (
              <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="size-3.5 text-muted-foreground" />
            )
          }
        >
          {evalId}
        </Chip>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Click to copy ID'}</TooltipContent>
    </Tooltip>
  );
};
