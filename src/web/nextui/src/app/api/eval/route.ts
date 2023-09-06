import { NextResponse } from 'next/server';

import promptfoo from '@/../../../index';

import { IS_RUNNING_LOCALLY } from '@/constants';
import { createJob, createResult, updateJob } from '@/database';

import type { EvaluateTestSuite } from '@/../../../types';

async function runWithDatabase(testSuite: EvaluateTestSuite) {
  const job = await createJob();

  promptfoo
    .evaluate(
      Object.assign({}, testSuite, {
        sharing: testSuite.sharing ?? true,
      }),
      {
        progressCallback: (progress, total) => {
          updateJob(job.id, progress, total);
          console.log(`[${job.id}] ${progress}/${total}`);
        },
      },
    )
    .then(async (result) => {
      console.log(`[${job.id}] Completed`);
      await createResult(job.id, testSuite, result);
    });

  return NextResponse.json({ id: job.id });
}

export async function POST(req: Request) {
  const testSuite = (await req.json()) as EvaluateTestSuite;
  if (IS_RUNNING_LOCALLY) {
    throw new Error('This route should only be used in hosted mode');
  }
  return runWithDatabase(testSuite);
}
