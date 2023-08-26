/*
import path from 'path';

import { NextResponse } from 'next/server';

import { readResult, listPreviousResults } from '../../../../../../../util';

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  const { filename } = params;
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !listPreviousResults().includes(safeFilename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  const result = readResult(safeFilename);
  if (!result) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }
  return NextResponse.json({ data: result });
}
*/

import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ data: 'NYI' });
}
