import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { createClientComponentClient, User, Session } from '@supabase/auth-helpers-nextjs';

import type { AuthTokenResponse, AuthError } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export const supabase = createClientComponentClient<Database>();

const AuthContext = createContext<
  Partial<{
    loggedIn: boolean;
    user: User | null;
    login: (email: string, password: string) => Promise<AuthTokenResponse>;
    logout: () => Promise<{ error: AuthError | null }>;
  }>
>({});

export const useAuth = () => useContext(AuthContext);

const login = (email: string, password: string) =>
  supabase.auth.signInWithPassword({ email, password });

const logout = () => supabase.auth.signOut();

/*
const passwordReset = (email: string) =>
  supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "/update-password"
  });
  */

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps): JSX.Element => {
  // Adapted from https://blog.openreplay.com/authentication-in-react-with-supabase/
  const [user, setUser] = useState<User | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean>(false);

  const fetchUser = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (data) {
      setUser(data.user);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event == 'PASSWORD_RECOVERY') {
        setLoggedIn(false);
      } else if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        setLoggedIn(true);
      } else if (event === 'SIGNED_OUT') {
        setLoggedIn(false);
        setUser(null);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchUser]);

  return (
    <AuthContext.Provider value={{ loggedIn, user, login, logout /*passwordReset*/ }}>
      {children}
    </AuthContext.Provider>
  );
};
