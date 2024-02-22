import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import Eval from './Eval';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

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
