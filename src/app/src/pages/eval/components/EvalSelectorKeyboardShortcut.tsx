import React, { useState } from 'react';
import EvalSelectorDialog from './EvalSelectorDialog';

interface EvalSelectorProps {
  onEvalSelected: (evalId: string) => void;
}

const EvalSelector: React.FC<EvalSelectorProps> = ({ onEvalSelected }) => {
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

  const handleEvalSelected = (evalId: string) => {
    onEvalSelected(evalId);
    handleClose();
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
      onEvalSelected={handleEvalSelected}
      onOpenFocusSearch
    />
  );
};

export default EvalSelector;
