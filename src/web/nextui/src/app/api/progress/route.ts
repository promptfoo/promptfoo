import { NextResponse } from 'next/server';

import { StandaloneEval, getStandaloneEvals, listPreviousResults } from '../../../../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET() {
  if (USE_SUPABASE) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  let results: StandaloneEval[];
  try {
    results = await getStandaloneEvals();
  } catch (err) {
    // Database potentially not yet set up.
    results = [];
  }
  return NextResponse.json({
    data: results,
  });
}
