/*
import { NextResponse } from 'next/server';

import { listPreviousResults } from '../../../../../../util';

export async function GET() {
  const previousResults = listPreviousResults();
  previousResults.reverse();
  return NextResponse.json({ data: previousResults });
}
*/

import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ data: 'NYI' });
}
