import { NextResponse } from 'next/server';

import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { getTestCases } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: Request) {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  try {
    return NextResponse.json({ data: await getTestCases() });
  } catch (error) {
    console.error('Failed to get test cases', error);
    return NextResponse.json(
      { error: 'Failed to get test cases', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
