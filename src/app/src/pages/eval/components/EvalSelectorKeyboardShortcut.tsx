import React, { useState } from 'react';

import EvalSelectorDialog from './EvalSelectorDialog';

interface EvalSelectorProps {
  onEvalSelected: (evalId: string) => void;
}

const EvalSelector = ({ onEvalSelected }: EvalSelectorProps) => {
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  React.useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field or textarea
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

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
    <EvalSelectorDialog open={open} onClose={handleClose} onEvalSelected={handleEvalSelected} />
  );
};

export default EvalSelector;
