import React, { useState } from 'react';
import FolderIcon from '@mui/icons-material/FolderOpen';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import EvalSelectorDialog from './EvalSelectorDialog';
import type { ResultLightweightWithLabel } from './types';

interface EvalSelectorProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (evalId: string) => void;
  currentEval: ResultLightweightWithLabel | null;
}

const EvalSelector: React.FC<EvalSelectorProps> = ({
  recentEvals,
  onRecentEvalSelected,
  currentEval,
}) => {
  const [open, setOpen] = useState(false);
  const isMac =
    typeof navigator === 'undefined'
      ? false
      : navigator.platform.toUpperCase().indexOf('MAC') !== -1;
  const tooltipTitle = isMac ? 'Search for Evals (⌘ + K)' : 'Search for Evals (Ctrl + K)';

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        handleOpen();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  return (
    <>
      <Tooltip title={tooltipTitle} arrow>
        <IconButton onClick={handleOpen} color="primary" size="small">
          <FolderIcon />
        </IconButton>
      </Tooltip>
      <EvalSelectorDialog
        title="Open an Eval"
        open={open}
        onClose={handleClose}
        recentEvals={recentEvals}
        onRecentEvalSelected={onRecentEvalSelected}
      />
    </>
  );
};

export default EvalSelector;
