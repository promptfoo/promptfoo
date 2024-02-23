import { NextResponse } from 'next/server';

import { filenameToDate, listPreviousResults } from '../../../../../../util';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET() {
  if (USE_SUPABASE) {
    return NextResponse.json({error: 'Not implemented'});
  }
  const previousResults = listPreviousResults();
  previousResults.reverse();
  return NextResponse.json({data: previousResults.map((fileMeta) => {
    const dateString = filenameToDate(fileMeta.fileName);
    return {
      id: fileMeta.fileName,
      label: fileMeta.description ? `${fileMeta.description} (${dateString})` : dateString,
    };
  })});
}