import { DropdownMenuItem, DropdownMenuItemIcon } from '@app/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { GitCompareArrows } from 'lucide-react';

interface CompareEvalMenuItemProps {
  onClick: () => void;
}

function CompareEvalMenuItem({ onClick }: CompareEvalMenuItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem onSelect={onClick}>
          <DropdownMenuItemIcon>
            <GitCompareArrows className="h-4 w-4" />
          </DropdownMenuItemIcon>
          Compare with another eval
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="left">Combine this eval with another eval run</TooltipContent>
    </Tooltip>
  );
}

export default CompareEvalMenuItem;
