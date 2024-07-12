import React, { useState } from 'react';
import CompareIcon from '@mui/icons-material/Compare';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import EvalSelectorDialog from './EvalSelectorDialog';
import { ResultLightweightWithLabel } from './types';

interface CompareEvalMenuItemProps {
  recentEvals: ResultLightweightWithLabel[];
  onComparisonEvalSelected: (evalId: string) => void;
}

function CompareEvalMenuItem({ recentEvals, onComparisonEvalSelected }: CompareEvalMenuItemProps) {
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
      <MenuItem onClick={handleOpenDialog}>
        <ListItemIcon>
          <CompareIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Compare with another eval</ListItemText>
      </MenuItem>
      <EvalSelectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleEvalSelected}
        title="Select an eval to compare"
      />
    </>
  );
}

export default CompareEvalMenuItem;
