import { Prisma, PrismaClient, EvaluationJob, EvaluationResult, JobStatus } from '@prisma/client';
import { EvaluateSummary, EvaluateTestSuite } from '../../../../../../types';

export { JobStatus } from '@prisma/client';
export type { EvaluationJob } from '@prisma/client';

const prisma = new PrismaClient();

export async function createJob(): Promise<EvaluationJob> {
  const job = await prisma.evaluationJob.create({
    data: {
      status: JobStatus.IN_PROGRESS,
      progress: 0,
      total: 0,
    },
  });
  return job;
}

export async function updateJob(
  id: string,
  progress: number,
  total: number,
  status = JobStatus.IN_PROGRESS,
) {
  await prisma.evaluationJob.update({
    where: { id },
    data: {
      progress,
      total,
      status,
    },
  });
}

export async function getJob(id: string): Promise<EvaluationJob> {
  const job = await prisma.evaluationJob.findUniqueOrThrow({
    where: { id },
  });
  return job;
}

export async function getResult(id: string): Promise<EvaluationResult> {
  const result = await prisma.evaluationResult.findUniqueOrThrow({
    where: { id },
  });
  return result;
}

export async function createResult(
  jobId: string,
  config: EvaluateTestSuite,
  results: EvaluateSummary,
): Promise<EvaluationResult> {
  const result = await prisma.evaluationResult.create({
    data: {
      id: jobId, // eval id matches job id
      version: 1,
      config: config as unknown as Prisma.JsonObject,
      results: results as unknown as Prisma.JsonObject,
    },
  });

  await prisma.evaluationJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETE,
      evaluationResult: {
        connect: {
          id: jobId,
        },
      },
    },
  });

  return result;
}
