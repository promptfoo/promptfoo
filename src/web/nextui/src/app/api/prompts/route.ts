import { NextResponse } from 'next/server';

import { IS_RUNNING_LOCALLY } from '@/constants';
import { getPrompts } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: Request) {
  try {
    return NextResponse.json({ data: await getPrompts() });
  } catch (error) {
    console.error('Failed to get prompts', error);
    return NextResponse.json(
      { error: 'Failed to get prompts', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
