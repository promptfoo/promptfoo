import React from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import Eval from './Eval';
import { IS_RUNNING_LOCALLY } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

// Don't cache database lookups.
export const revalidate = 0

export default async function Page() {
  if (!IS_RUNNING_LOCALLY) {
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
