import { useState } from 'react';

import { DropdownMenuItem, DropdownMenuItemIcon } from '@app/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { GitCompareArrows } from 'lucide-react';
import EvalSelectorDialog from './EvalSelectorDialog';
import { useTableStore } from './store';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

interface CompareEvalMenuItemProps {
  initialEvals: ResultLightweightWithLabel[];
  onComparisonEvalSelected: (evalId: string) => void;
  onMenuClose?: () => void;
}

function CompareEvalMenuItem({ onComparisonEvalSelected, onMenuClose }: CompareEvalMenuItemProps) {
  const { evalId: currentEvalId } = useTableStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    onMenuClose?.();
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleEvalSelected = (evalId: string) => {
    // Prevent self-comparison
    if (evalId === currentEvalId) {
      handleCloseDialog();
      return;
    }

    try {
      onComparisonEvalSelected(evalId);
    } finally {
      // Always close the dialog, even if the callback throws an error
      handleCloseDialog();
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuItem
            onSelect={(event) => {
              // Prevent the dropdown from closing so the dialog can open
              event.preventDefault();
              handleOpenDialog();
            }}
          >
            <DropdownMenuItemIcon>
              <GitCompareArrows className="h-4 w-4" />
            </DropdownMenuItemIcon>
            Compare with another eval
          </DropdownMenuItem>
        </TooltipTrigger>
        <TooltipContent side="left">Combine this eval with another eval run</TooltipContent>
      </Tooltip>
      <EvalSelectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onEvalSelected={(evalId) => {
          handleEvalSelected(evalId);
        }}
        description="Only evals with the same dataset can be compared."
        focusedEvalId={currentEvalId ?? undefined}
        filterByDatasetId
      />
    </>
  );
}

export default CompareEvalMenuItem;
