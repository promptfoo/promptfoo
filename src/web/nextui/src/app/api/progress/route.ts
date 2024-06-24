import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { NextResponse } from 'next/server';
import { StandaloneEval, getStandaloneEvals } from '../../../../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET() {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
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
