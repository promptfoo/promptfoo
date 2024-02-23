import { NextResponse } from 'next/server';

import { filenameToDate, listPreviousResults } from '../../../../../../util';

export async function GET() {
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