import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { fetchUserEmail } from '@app/utils/api';
import { UserContext } from './UserContextDef';

export function UserProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUserEmail = async () => {
      const userEmail = await fetchUserEmail();
      setEmail(userEmail);
      setIsLoading(false);
    };

    loadUserEmail();
  }, []);

  const value = useMemo(() => ({ email, setEmail, isLoading }), [email, isLoading]);

  return <UserContext value={value}>{children}</UserContext>;
}
