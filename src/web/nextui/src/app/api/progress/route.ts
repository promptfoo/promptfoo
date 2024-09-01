import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { NextResponse } from 'next/server';
import type { StandaloneEval } from '../../../../../../util';
import { getStandaloneEvals } from '../../../../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: Request) {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  const searchParams = new URLSearchParams(req.url);
  const description = searchParams.get('description') ?? undefined;
  let results: StandaloneEval[];
  try {
    results = await getStandaloneEvals({ description });
  } catch (err) {
    // Database potentially not yet set up.
    results = [];
  }
  return NextResponse.json({
    data: results,
  });
}
