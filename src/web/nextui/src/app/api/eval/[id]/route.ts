import invariant from 'tiny-invariant';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getJob, getResult, JobStatus, EvaluationJob } from '@/database';
import {IS_RUNNING_LOCALLY} from '@/constants';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = params;
  let job: EvaluationJob | undefined;
  try {
    job = await getJob(supabase, id);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  invariant(job, 'Job not found');

  if (job.status === JobStatus.COMPLETE) {
    const result = await getResult(supabase, id);
    return NextResponse.json({ status: 'complete', result });
  } else {
    return NextResponse.json({ status: 'in-progress', progress: job.progress, total: job.total });
  }
}
