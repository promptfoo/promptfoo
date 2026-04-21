import { DropdownMenuItem, DropdownMenuItemIcon } from '@app/components/ui/dropdown-menu';
import { GitCompareArrows } from 'lucide-react';

interface CompareEvalMenuItemProps {
  onClick: () => void;
}

function CompareEvalMenuItem({ onClick }: CompareEvalMenuItemProps) {
  return (
    <DropdownMenuItem onSelect={onClick}>
      <DropdownMenuItemIcon>
        <GitCompareArrows className="size-4" />
      </DropdownMenuItemIcon>
      Compare with another eval
    </DropdownMenuItem>
  );
}

export default CompareEvalMenuItem;
