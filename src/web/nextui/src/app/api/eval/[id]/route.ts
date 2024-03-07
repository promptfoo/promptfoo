import * as fs from 'fs';

import { NextRequest, NextResponse } from 'next/server';
import { validate as uuidValidate } from 'uuid';

import store from '@/app/api/eval/shareStore';
import { IS_RUNNING_LOCALLY } from '@/constants';

import type { EvaluateTable, FilePath, ResultsFile, UnifiedConfig } from '@/../../../types';
import { readResult, updateResult } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

async function getDataForId(id: string): Promise<{data: ResultsFile | null; filePath: FilePath; uuid: string}> {
  let uuid: string;
  let filePath: FilePath;
  if (uuidValidate(id)) {
    uuid = id;
    filePath = (await store.get(`uuid:${id}`)) as string;
  } else {
    uuid = (await store.get(`file:${id}`)) as string;
    filePath = id;
  }
  let data: ResultsFile | null = null;
  try {
    const fileContents = readResult(filePath);
    if (!fileContents) {
      throw new Error('No file contents');
    }
    data = fileContents?.result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        data = JSON.parse(filePath) as ResultsFile;
      } catch {
        throw new Error('Invalid JSON');
      }
    } else {
      throw error;
    }
  }
  return { data, filePath, uuid };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await getDataForId(params.id);
    if (!data) {
      return NextResponse.json({ error: 'Data not found or invalid JSON' }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: 'An error occurred while fetching the data', details: error },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  console.log('Patching eval result with id', params.id);
  try {
    const newData = (await req.json()) as { table?: EvaluateTable; config?: Partial<UnifiedConfig> };
    if (!params.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const current = await getDataForId(params.id);
    if (!current) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }
    updateResult(current.filePath, newData.config, newData.table);
    return NextResponse.json({ message: 'Eval updated successfully' }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update eval', details: String(err) }, { status: 500 });
  }
}
