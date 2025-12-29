import { type ReactNode, useEffect, useState } from 'react';

import { fetchPylonEmailHash, fetchUserEmail } from '@app/utils/api';
import { UserContext } from './UserContextDef';

export function UserProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pylonEmailHash, setPylonEmailHash] = useState<string | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      const [userEmail, emailHash] = await Promise.all([fetchUserEmail(), fetchPylonEmailHash()]);
      setEmail(userEmail);
      setPylonEmailHash(emailHash);
      setIsLoading(false);
    };

    loadUserData();
  }, []);

  return (
    <UserContext value={{ email, setEmail, isLoading, pylonEmailHash }}>{children}</UserContext>
  );
}
