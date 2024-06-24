import { ShiftKeyContext } from '@/app/contexts/ShiftKeyContext';
import { useContext } from 'react';

export const useShiftKey = () => {
  const context = useContext(ShiftKeyContext);
  if (context === undefined) {
    throw new Error('useShiftKey must be used within a ShiftKeyProvider');
  }
  return context;
};
