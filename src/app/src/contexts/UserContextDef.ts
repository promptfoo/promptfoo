import { createContext } from 'react';

interface UserContextType {
  email: string | null;
  setEmail: (email: string) => void;
  isLoading: boolean;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);
