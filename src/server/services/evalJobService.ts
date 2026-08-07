import type { Job } from '../../types/index';

function createInitialJob(): Job {
  return {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    result: null,
    logs: [],
  };
}

function cloneResult(result: NonNullable<Job['result']>): NonNullable<Job['result']> {
  const ancestors: unknown[] = [];
  const serialized = JSON.stringify(result, function (_key, value) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value === 'object' && value !== null) {
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
      }
      if (ancestors.includes(value)) {
        return undefined;
      }
      ancestors.push(value);
    }
    return value;
  });

  return JSON.parse(serialized);
}

function cloneJob(job: Job): Job {
  return {
    ...job,
    result: job.result === null ? null : cloneResult(job.result),
    logs: [...job.logs],
  };
}

export class EvalJobService {
  private jobs = new Map<string, Job>();

  create(id: string): Job {
    const job = createInitialJob();
    this.jobs.set(id, job);
    return cloneJob(job);
  }

  get(id: string): Job | undefined {
    const job = this.jobs.get(id);
    return job ? cloneJob(job) : undefined;
  }

  setProgress(id: string, progress: number, total: number): boolean {
    return this.update(id, (job) => {
      job.progress = progress;
      job.total = total;
    });
  }

  complete(id: string, result: Job['result'], evalId: string | null): boolean {
    return this.update(id, (job) => {
      job.status = 'complete';
      job.result = result === null ? null : cloneResult(result);
      job.evalId = evalId;
    });
  }

  fail(
    id: string,
    logs: string[],
    { append = false, resetResult = true }: { append?: boolean; resetResult?: boolean } = {},
  ): boolean {
    return this.update(id, (job) => {
      job.status = 'error';
      if (resetResult) {
        job.result = null;
        job.evalId = null;
      }
      job.logs = append ? [...job.logs, ...logs] : [...logs];
    });
  }

  appendLog(id: string, message: string): boolean {
    return this.update(id, (job) => {
      job.logs.push(message);
    });
  }

  private update(id: string, updateJob: (job: Job) => void): boolean {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    updateJob(job);
    return true;
  }
}

export const evalJobService = new EvalJobService();
