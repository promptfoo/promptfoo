import invariant from 'tiny-invariant';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { v4 as uuidv4 } from 'uuid';

import promptfoo from '@/../../../index';

import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import { createJob, createResult, updateJob } from '@/database';

import evalJobs from './evalJobsStore';

import type { EvaluateTestSuiteWithEvaluateOptions } from '@/../../../types';

export const dynamic = IS_RUNNING_LOCALLY ? 'auto' : 'force-dynamic';

async function runWithDatabase(testSuite: EvaluateTestSuiteWithEvaluateOptions) {
  const supabase = createRouteHandlerClient({ cookies });

  const job = await createJob(supabase);

  promptfoo
    .evaluate(
      Object.assign({}, testSuite, {
        sharing: testSuite.sharing ?? true,
        eventSource: 'webui',
      }),
      {
        ...testSuite.evaluateOptions,
        progressCallback: (progress, total) => {
          updateJob(supabase, job.id, progress, total);
          console.log(`[${job.id}] ${progress}/${total}`);
        },
      },
    )
    .then(async (result) => {
      console.log(`[${job.id}] Completed`);
      await createResult(supabase, job.id, testSuite, result);
    });

  return NextResponse.json({ id: job.id });
}

export async function POST(req: Request) {
  const testSuite = (await req.json()) as EvaluateTestSuiteWithEvaluateOptions;
  if (IS_RUNNING_LOCALLY) {
    throw new Error('This route should only be used in hosted mode');
  } else if (USE_SUPABASE) {
    return runWithDatabase(testSuite);
  } else {
    const id = uuidv4();
    evalJobs.set(id, { status: 'in-progress', progress: 0, total: 0, result: null });

    promptfoo
      .evaluate(
        Object.assign({}, testSuite, {
          writeLatestResults: true,
          sharing: testSuite.sharing ?? true,
        }),
        {
          ...testSuite.evaluateOptions,
          eventSource: 'web',
          progressCallback: (progress, total) => {
            const job = evalJobs.get(id);
            invariant(job, 'Job not found');
            job.progress = progress;
            job.total = total;
            console.log(`[${id}] ${progress}/${total}`);
          },
        },
      )
      .then((result) => {
        const job = evalJobs.get(id);
        invariant(job, 'Job not found');
        job.status = 'complete';
        job.result = result;
        console.log(`[${id}] Complete`);
      });

    return NextResponse.json({ id });
  }
}
