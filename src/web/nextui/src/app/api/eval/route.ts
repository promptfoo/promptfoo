import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import storePromise from '@/app/api/eval/shareStore';
import { IS_RUNNING_LOCALLY } from '@/constants';
import { writeResultsToDatabase } from '@/../../../util';
import { runDbMigrations } from '@/../../../../migrate';

import type { SharedResults } from '@/../../../types';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function POST(req: Request) {
  try {
    const store = await storePromise;
    // Share endpoint
    const payload = (await req.json()) as SharedResults;
    const newId = `f:${uuidv4()}`;
    console.log('Storing eval result with id', newId);

    // Run db migrations if necessary
    await runDbMigrations();

    // Write it to disk
    const evalId = await writeResultsToDatabase(payload.data.results, payload.data.config);

    if (!evalId) {
      return NextResponse.json({ error: 'Failed to store evaluation result' }, { status: 500 });
    }

    // Then store a pointer
    await store.set(`uuid:${newId}`, evalId);
    // And a reverse pointer...
    await store.set(`file:${evalId}`, newId);

    return NextResponse.json({ id: newId }, { status: 200 });
  } catch (error) {
    console.error('Failed to store evaluation result', error);
    return NextResponse.json(
      { error: 'Failed to store evaluation result', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
