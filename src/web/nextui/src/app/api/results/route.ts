import { NextResponse } from 'next/server';

import { listPreviousResults } from '../../../../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET() {
  if (USE_SUPABASE) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  let previousResults: { evalId: string; description?: string | null }[];
  try {
    previousResults = await listPreviousResults();
  } catch (err) {
    // Database potentially not yet set up.
    previousResults = [];
  }
  return NextResponse.json({
    data: previousResults.map((meta) => {
      return {
        id: meta.evalId,
        label: meta.description ? `${meta.description} (${meta.evalId})` : meta.evalId,
      };
    }),
  });
}
