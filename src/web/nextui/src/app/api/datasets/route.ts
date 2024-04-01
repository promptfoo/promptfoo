import { NextResponse } from 'next/server';

import { IS_RUNNING_LOCALLY } from '@/constants';
import { getTestCases } from '@/../../../util';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: Request) {
  try {
    return NextResponse.json({ data: await getTestCases() });
  } catch (error) {
    console.error('Failed to get test cases', error);
    return NextResponse.json(
      { error: 'Failed to get test cases', details: (error as Error).toString() },
      { status: 500 },
    );
  }
}
