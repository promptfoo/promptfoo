import { type ReactNode } from 'react';

import { useUser, useSetUserEmail } from '@app/hooks/useUser';
import { UserContext } from './UserContextDef';

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useUser();
  const email = user?.email ?? null;
  const setEmail = useSetUserEmail();

  return (
    <UserContext.Provider value={{ email, setEmail, isLoading }}>{children}</UserContext.Provider>
  );
}
