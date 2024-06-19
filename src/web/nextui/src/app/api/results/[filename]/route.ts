import { NextResponse } from 'next/server';

import { readResult } from '../../../../../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  if (USE_SUPABASE || IS_RUNNING_LOCALLY) {
    return NextResponse.json({ error: 'Not implemented' });
  }
  const { filename: evalId } = params;
  const match = await readResult(evalId);
  if (!match) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }
  return NextResponse.json({ data: match.result });
}
