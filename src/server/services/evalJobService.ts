import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import logger from '../../logger';

import type { Job } from '../../types/index';

type StoredJob = Omit<Job, 'result'> & { resultPath: string | null };

let resultDirectory: string | undefined;
let cleanupRegistered = false;

function storeResult(result: NonNullable<Job['result']>): string {
  const serialized = serializeResult(result);
  let resultPath: string | undefined;
  let descriptor: number | undefined;
  try {
    if (!resultDirectory || !fs.statSync(resultDirectory, { throwIfNoEntry: false })) {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-job-results-'));
      try {
        if (process.platform !== 'win32') {
          fs.chmodSync(directory, 0o700);
        }
      } catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        throw error;
      }
      resultDirectory = directory;
      // Temporary-file cleanup may remove a prior directory. Allocate a new private
      // path, and keep one exit listener that cleans the current directory.
      if (!cleanupRegistered) {
        process.once('exit', () => {
          try {
            if (resultDirectory) {
              fs.rmSync(resultDirectory, { recursive: true, force: true });
            }
          } catch {
            // Cleanup at process exit is best effort.
          }
        });
        cleanupRegistered = true;
      }
    }
    resultPath = path.join(resultDirectory, `${randomUUID()}.json`);
    descriptor = fs.openSync(resultPath, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, serialized, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    return resultPath;
  } catch (error) {
    // An exclusive-open failure must never remove another snapshot's file.
    if (descriptor !== undefined) {
      removeResult(resultPath);
    }
    logger.error('Failed to store eval job result snapshot', { error });
    throw new Error('Failed to store eval job result snapshot');
  }
}

function removeResult(resultPath: string | null | undefined): void {
  if (resultPath) {
    try {
      fs.rmSync(resultPath, { force: true });
    } catch (error) {
      logger.warn('Failed to remove obsolete job result snapshot', { error });
    }
  }
}

function createInitialJob(): StoredJob {
  return {
    evalId: null,
    status: 'in-progress',
    progress: 0,
    total: 0,
    resultPath: null,
    logs: [],
  };
}

function serializeResult(result: NonNullable<Job['result']>): string {
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

  return serialized;
}

function cloneJob(job: StoredJob): Job {
  const { resultPath, ...fields } = job;
  return {
    ...fields,
    result: resultPath === null ? null : JSON.parse(fs.readFileSync(resultPath, 'utf8')),
    logs: [...job.logs],
  };
}

export class EvalJobService {
  private jobs = new Map<string, StoredJob>();

  create(id: string): Job {
    const previous = this.jobs.get(id);
    const job = createInitialJob();
    this.jobs.set(id, job);
    removeResult(previous?.resultPath);
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
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }
    // Serialize and write before replacing a previous completion snapshot.
    const resultPath = result === null ? null : storeResult(result);
    const previousPath = job.resultPath;
    job.status = 'complete';
    job.resultPath = resultPath;
    job.evalId = evalId;
    removeResult(previousPath);
    return true;
  }

  fail(
    id: string,
    logs: string[],
    { append = false, resetResult = true }: { append?: boolean; resetResult?: boolean } = {},
  ): boolean {
    return this.update(id, (job) => {
      job.status = 'error';
      if (resetResult) {
        const previousPath = job.resultPath;
        job.resultPath = null;
        job.evalId = null;
        removeResult(previousPath);
      }
      job.logs = append ? [...job.logs, ...logs] : [...logs];
    });
  }

  appendLog(id: string, message: string): boolean {
    return this.update(id, (job) => {
      job.logs.push(message);
    });
  }

  private update(id: string, updateJob: (job: StoredJob) => void): boolean {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    updateJob(job);
    return true;
  }
}

export const evalJobService = new EvalJobService();
