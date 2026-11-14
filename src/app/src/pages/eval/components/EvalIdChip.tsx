import { useCallback } from 'react';

import { Chip } from '@app/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useCopyFeedback } from '@app/hooks/useCopyFeedback';
import { Check, Copy } from 'lucide-react';

interface EvalIdChipProps {
  evalId: string;
  onCopy: () => void;
}

export const EvalIdChip = ({ evalId, onCopy }: EvalIdChipProps) => {
  const [copied, showCopied] = useCopyFeedback(2000);
  const handleCopy = useCallback(() => {
    onCopy();
    showCopied();
  }, [onCopy, showCopied]);

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
