import invariant from 'tiny-invariant';
import { NextRequest, NextResponse } from 'next/server';

import { getJob, getResult, JobStatus, EvaluationJob } from '@/database';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  let job: EvaluationJob | undefined;
  try {
    job = await getJob(id);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  invariant(job, 'Job not found');

  if (job.status === JobStatus.COMPLETE) {
    const result = await getResult(id);
    return NextResponse.json({ status: 'complete', result });
  } else {
    return NextResponse.json({ status: 'in-progress', progress: job.progress, total: job.total });
  }
}
