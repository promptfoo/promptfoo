import React from 'react';

import { createClientComponentClient, User } from '@supabase/auth-helpers-nextjs'

import type { Database } from '@/types/supabase';

export default function LoggedInAs() {
  const supabase = createClientComponentClient<Database>()

  const [user, setUser] = React.useState<User | null>(null)

  const fetchUser = React.useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession()
    if (data) {
      setUser(data.user)
    }
  }, [supabase.auth])

  React.useEffect(() => {
    fetchUser()
  }, [fetchUser])

  return user ? (<div>Logged in as {user.email}</div>) : null;
}
