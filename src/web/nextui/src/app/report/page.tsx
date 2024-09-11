import React from 'react';
import Report from './Report';

// We don't really want to cache database lookups, but make this non-zero so
// that this page is still included in `export` mode.
export const revalidate = 1;

export default async function Page() {
  return <Report />;
}
