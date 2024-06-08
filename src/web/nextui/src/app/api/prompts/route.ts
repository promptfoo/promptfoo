import { NextResponse } from 'next/server';

import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { getPrompts } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET() {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  try {
    return NextResponse.json({ data: await getPrompts() });
  } catch (error) {
    console.error('Failed to get prompts', error);
    return NextResponse.json(
      { error: 'Failed to get prompts', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
