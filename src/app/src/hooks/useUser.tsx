import { useContext } from 'react';
import { UserContext } from '@app/contexts/UserContextDef';

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
