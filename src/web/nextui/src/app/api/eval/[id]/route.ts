import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import store from '@/app/api/eval/shareStore';
import { IS_RUNNING_LOCALLY } from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const result = await store.get(params.id);
    if (!result) {
      return NextResponse.json({ error: 'Data not found' }, { status: 404 });
    } else {
      return NextResponse.json({ data: JSON.parse(result as string) });
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'An error occurred while retrieving data', details: err },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const evalTable = await req.json();
    if (!params.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    await store.set(params.id, JSON.stringify(evalTable));
    return NextResponse.json({ message: 'Table updated successfully' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update evaluation table', details: error },
      { status: 500 },
    );
  }
}
