import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { NextResponse } from 'next/server';
import type { StandaloneEval } from '../../../../../../util';
import { getStandaloneEvals } from '../../../../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(request: Request) {
  if (USE_SUPABASE) {
    return NextResponse.json({ error: 'Not implemented' });
  }

  const { searchParams } = new URL(request.url);
  const tagName = searchParams.get('tagName');
  const tagValue = searchParams.get('tagValue');

  let results: StandaloneEval[];
  try {
    const tag = tagName && tagValue ? { key: tagName, value: tagValue } : undefined;
    results = await getStandaloneEvals({ tag });
  } catch (err) {
    // Database potentially not yet set up.
    results = [];
  }

  return NextResponse.json({
    data: results,
  });
}
