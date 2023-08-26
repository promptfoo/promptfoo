/*
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { readResult, listPreviousResults } from '../../../../../../../util';
import debounce from 'debounce';

const latestJsonPath = '~/.promptfoo/output/latest.json';
let latestJsonData: any = null;

const readLatestJson = () => {
  const data = fs.readFileSync(latestJsonPath, 'utf8');
  return JSON.parse(data);
};

const watcher = debounce((curr: fs.Stats, prev: fs.Stats) => {
  if (curr.mtime !== prev.mtime) {
    latestJsonData = readLatestJson();
  }
}, 250);

fs.watchFile(latestJsonPath, watcher);

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  const { filename } = params;
  const safeFilename = path.basename(filename);
  if (safeFilename !== filename || !listPreviousResults().includes(safeFilename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  if (!latestJsonData) {
    return NextResponse.json({ error: 'Result not found' }, { status: 404 });
  }
  return NextResponse.json({ data: latestJsonData });
}
*/

import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ data: 'NYI' });
}
