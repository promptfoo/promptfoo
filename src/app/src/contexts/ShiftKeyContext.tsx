import { type ReactNode, useEffect, useState } from 'react';

import { ShiftKeyContext } from './ShiftKeyContextDef';

export const ShiftKeyProvider = ({ children }: { children: ReactNode }) => {
  const [isShiftKeyPressed, setShiftKeyPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftKeyPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftKeyPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return <ShiftKeyContext value={isShiftKeyPressed}>{children}</ShiftKeyContext>;
};
