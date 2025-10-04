import { type ReactNode, useEffect } from 'react';

import { useUserStore } from '@app/stores/userStore';
import { UserContext } from './UserContextDef';

export function UserProvider({ children }: { children: ReactNode }) {
  const { email, isLoading, setEmail, fetchEmail } = useUserStore();

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  return (
    <UserContext.Provider value={{ email, setEmail, isLoading }}>{children}</UserContext.Provider>
  );
}
