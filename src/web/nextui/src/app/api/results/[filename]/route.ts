import path from 'path';

import { NextResponse } from 'next/server';

import { readResult, listPreviousResultFilenames } from '../../../../../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  if (USE_SUPABASE) {
    return NextResponse.json({error: 'Not implemented'});
  }
  const { filename } = params;
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !listPreviousResultFilenames().includes(safeFilename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  const file = readResult(safeFilename);
  if (!file) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }
  return NextResponse.json({ data: file.result });
}
