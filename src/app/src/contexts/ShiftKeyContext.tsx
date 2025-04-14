import type { ReactNode } from 'react';
import React, { useState, useEffect } from 'react';
import { ShiftKeyContext } from './ShiftKeyContextDef';

export const ShiftKeyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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

  return <ShiftKeyContext.Provider value={isShiftKeyPressed}>{children}</ShiftKeyContext.Provider>;
};
