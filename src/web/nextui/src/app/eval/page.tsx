import React from 'react';
import { USE_SUPABASE } from '@app/constants';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import Link from 'next/link';
import Eval from './Eval';

// We don't really want to cache database lookups, but make this non-zero so
// that this page is still included in `export` mode.
export const revalidate = 1;

export default async function Page() {
  if (USE_SUPABASE) {
    const supabase = createServerComponentClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return (
        <div style={{ textAlign: 'center' }}>
          <Link href="/auth/login">Log in</Link> or <Link href="/auth/signup">Sign Up</Link> to save
          and view past evals.
        </div>
      );
    }
  }

  // TODO(ian): Pass recent evals as well
  return <Eval />;
}
