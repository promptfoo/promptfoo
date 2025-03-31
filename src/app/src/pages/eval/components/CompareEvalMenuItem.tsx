import { useState } from 'react';
import CompareIcon from '@mui/icons-material/Compare';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import EvalSelectorDialog from './EvalSelectorDialog';
import { useStore } from './store';

/**
 * Menu item that opens a dialog to select an eval to compare with the current eval
 */
interface CompareEvalMenuItemProps {
  onComparisonEvalSelected: (evalId: string) => void;
}

function CompareEvalMenuItem({ onComparisonEvalSelected }: CompareEvalMenuItemProps) {
  const { evalId: currentEvalId } = useStore();
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
        <ListItemText primary="Compare with..." />
      </MenuItem>
      <EvalSelectorDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onEvalSelected={handleEvalSelected}
        title="Select an eval to compare"
        description="Only evals with the same dataset can be compared."
        focusedEvalId={currentEvalId ?? undefined}
      />
    </>
  );
}

export default CompareEvalMenuItem;
