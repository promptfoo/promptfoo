import { NextRequest, NextResponse } from 'next/server';
import { validate as uuidValidate } from 'uuid';

import storePromise from '@/app/api/eval/shareStore';
import { IS_RUNNING_LOCALLY } from '@/constants';

import type { EvaluateTable, FilePath, ResultsFile, UnifiedConfig } from '@/../../../types';
import { readResult, updateResult, deleteEval } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

async function getDataForId(
  id: string,
): Promise<{ data: ResultsFile | null; evalId: string; uuid: string }> {
  const store = await storePromise;
  let uuidLookup: string;
  let evalId: FilePath;
  const actualUuid = id.includes(':') ? id.split(':')[1] : id;
  if (uuidValidate(actualUuid)) {
    uuidLookup = id;
    evalId = (await store.get(`uuid:${id}`)) as string;
  } else {
    uuidLookup = (await store.get(`file:${id}`)) as string;
    evalId = id;
  }
  let data: ResultsFile | null = null;
  try {
    const eval_ = await readResult(evalId);
    if (!eval_) {
      throw new Error('Could not find eval');
    }
    data = eval_?.result;
  } catch (error) {
    console.error('Failed to read eval', error);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        data = JSON.parse(evalId) as ResultsFile;
      } catch {
        throw new Error('Invalid JSON');
      }
    } else {
      throw error;
    }
  }
  return { data, evalId, uuid: uuidLookup };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resp = await getDataForId(params.id);
    if (!resp) {
      console.error('Data not found for id', params.id);
      return NextResponse.json({ error: 'Data not found or invalid JSON' }, { status: 404 });
    }
    return NextResponse.json(resp);
  } catch (error) {
    console.error('Failed to fetch data', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching the data', details: error },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  console.log('Patching eval result with id', params.id);
  try {
    const newData = (await req.json()) as {
      table?: EvaluateTable;
      config?: Partial<UnifiedConfig>;
    };
    if (!params.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    const current = await getDataForId(params.id);
    if (!current) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    }
    updateResult(current.evalId, newData.config, newData.table);
    return NextResponse.json({ message: 'Eval updated successfully' }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Failed to update eval', details: String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  console.log('Deleting eval result with id', params.id);
  try {
    if (!params.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    await deleteEval(params.id);
    return NextResponse.json({ message: 'Eval deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error('Failed to delete eval', error);
    return NextResponse.json(
      { error: 'Failed to delete eval', details: String(error) },
      { status: 500 },
    );
  }
}
