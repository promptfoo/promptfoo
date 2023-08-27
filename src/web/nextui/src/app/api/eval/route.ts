import { NextResponse } from 'next/server';

import promptfoo from '@/../../../index';

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
  if (!process.env.NEXT_PUBLIC_PROMPTFOO_WITH_DATABASE) {
    throw new Error('This route should only be used in database mode');
  }
  return runWithDatabase(testSuite);
}
