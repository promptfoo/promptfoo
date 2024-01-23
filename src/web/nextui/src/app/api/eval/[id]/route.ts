import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import cacheManager, { Cache } from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';

const store = cacheManager.caching({
  store: fsStore,
  options: {
    path: 'diskcache',
    ttl: 60 * 60 * 24 * 14,
  },
});

async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

async function POST(req: Request) {
  try {
    const evalResult = await req.json();
    const newId = `f:${uuidv4()}`;
    await store.set(newId, JSON.stringify(evalResult));
    return NextResponse.json({ id: newId }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to store evaluation result', details: error },
      { status: 500 },
    );
  }
}

async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
