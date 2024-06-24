import Report from './Report';
import { IS_RUNNING_LOCALLY } from '@/constants';
import React from 'react';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

// We don't really want to cache database lookups, but make this non-zero so
// that this page is still included in `export` mode.
export const revalidate = 1;

export default async function Page() {
  return <Report />;
}
