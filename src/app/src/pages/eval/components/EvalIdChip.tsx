import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { ClipboardCopy, Fingerprint } from 'lucide-react';

interface EvalIdChipProps {
  evalId: string;
  onCopy: () => void;
}

export const EvalIdChip = ({ evalId, onCopy }: EvalIdChipProps) => {
  const handleCopy = () => {
    onCopy();
  };

  return (
    <div className="flex items-center border border-border rounded px-2 py-1 hover:bg-muted transition-colors">
      <Fingerprint className="h-4 w-4 mr-2 opacity-70" data-testid="FingerprintIcon" />
      <span className="text-sm mr-2">
        <strong>ID:</strong> {evalId}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="ml-auto p-1 rounded hover:bg-muted transition-colors"
            onClick={handleCopy}
            aria-label="Copy Eval ID"
          >
            <ClipboardCopy className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Copy ID</TooltipContent>
      </Tooltip>
    </div>
  );
};
