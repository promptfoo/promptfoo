import React, { useState } from 'react';
import CompareIcon from '@mui/icons-material/Compare';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import EvalSelectorDialog from './EvalSelectorDialog';
import { useTableStore } from './store';
import type { ResultLightweightWithLabel } from './types';

interface CompareEvalMenuItemProps {
  initialEvals: ResultLightweightWithLabel[];
  onComparisonEvalSelected: (evalId: string) => void;
}

function CompareEvalMenuItem({ onComparisonEvalSelected }: CompareEvalMenuItemProps) {
  const { evalId: currentEvalId } = useTableStore();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
  };

  const handleEvalSelected = (evalId: string) => {
    onComparisonEvalSelected(evalId);
    handleCloseDialog();
  };

  return (
    <>
      <Tooltip title="Combine this eval with another eval run" placement="left">
        <MenuItem onClick={handleOpenDialog}>
          <ListItemIcon>
            <CompareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Compare with another eval</ListItemText>
        </MenuItem>
      </Tooltip>
      <EvalSelectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onEvalSelected={(evalId) => {
          handleEvalSelected(evalId);
        }}
        title="Select an eval to compare"
        description="Only evals with the same dataset can be compared."
        focusedEvalId={currentEvalId ?? undefined}
        filterByDatasetId
      />
    </>
  );
}

export default CompareEvalMenuItem;
