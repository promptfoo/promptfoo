import { type ReactNode } from 'react';

import { useUserEmail, useSetUserEmail } from '@app/hooks/useUser';
import { UserContext } from './UserContextDef';

export function UserProvider({ children }: { children: ReactNode }) {
  const { email, isLoading } = useUserEmail();
  const setEmail = useSetUserEmail();

  return (
    <UserContext.Provider value={{ email, setEmail, isLoading }}>{children}</UserContext.Provider>
  );
}
