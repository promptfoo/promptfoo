import React, { useState } from 'react';
import EvalSelectorDialog from './EvalSelectorDialog';
import type { ResultLightweightWithLabel } from './types';

interface EvalSelectorProps {
  recentEvals: ResultLightweightWithLabel[];
  onRecentEvalSelected: (evalId: string) => void;
}

const EvalSelector: React.FC<EvalSelectorProps> = ({ recentEvals, onRecentEvalSelected }) => {
  const [open, setOpen] = useState(false);
  //const isMac =
  //  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  //const tooltipTitle = isMac ? 'Search for Evals (⌘ + K)' : 'Search for Evals (Ctrl + K)';

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
    <EvalSelectorDialog
      title="Open an Eval"
      open={open}
      onClose={handleClose}
      recentEvals={recentEvals}
      onRecentEvalSelected={onRecentEvalSelected}
    />
  );
};

export default EvalSelector;
