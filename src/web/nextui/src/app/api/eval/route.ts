import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import store from '@/app/api/eval/shareStore';
import { IS_RUNNING_LOCALLY } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const newId = `f:${uuidv4()}`;
    console.log('Storing eval result with id', newId);
    await store.set(newId, JSON.stringify(payload.data));
    return NextResponse.json({ id: newId }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to store evaluation result', details: error },
      { status: 500 },
    );
  }
}
