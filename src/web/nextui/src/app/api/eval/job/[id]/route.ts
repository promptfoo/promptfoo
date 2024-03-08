import invariant from 'tiny-invariant';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { getJob, getResult, SupabaseJobStatus, SupabaseEvaluationJob } from '@/database';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import evalJobs from '../evalJobsStore';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (USE_SUPABASE) {
    const supabase = createRouteHandlerClient({ cookies });
    const { id } = params;
    let job: SupabaseEvaluationJob | undefined;
    try {
      job = await getJob(supabase, id);
    } catch (err) {
      console.error(err);
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    invariant(job, 'Job not found');

    if (job.status === SupabaseJobStatus.COMPLETE) {
      const result = await getResult(supabase, id);
      return NextResponse.json({ status: 'complete', result });
    } else {
      return NextResponse.json({ status: 'in-progress', progress: job.progress, total: job.total });
    }
  } else {
    const id = params.id;
    const job = evalJobs.get(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.status === 'complete') {
      return NextResponse.json({ status: 'complete', result: job.result });
    } else {
      return NextResponse.json({ status: 'in-progress', progress: job.progress, total: job.total });
    }
  }
}
