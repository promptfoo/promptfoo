import { useContext } from 'react';
import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';

export const useShiftKey = () => {
  const context = useContext(ShiftKeyContext);
  if (context === undefined) {
    throw new Error('useShiftKey must be used within a ShiftKeyProvider');
  }
  return context;
};
