import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Job } from '../../types/index';

type ResultDirectory = { path: string; dev: number; ino: number };
type DiskResultSnapshot = { path: string; directory: ResultDirectory };
type ResultSnapshot = DiskResultSnapshot | string;
type StoredJob = Omit<Job, 'result'> & { resultSnapshot: ResultSnapshot | null };

let resultDirectory: ResultDirectory | undefined;
let cleanupRegistered = false;

function hasPrivatePermissions(stats: fs.Stats, mode: number): boolean {
  return stats.uid === process.geteuid!() && (stats.mode & 0o777) === mode;
}

function ownsDirectory(directory: ResultDirectory): boolean {
  const stats = fs.lstatSync(directory.path, { throwIfNoEntry: false });
  return (
    stats !== undefined &&
    stats.isDirectory() &&
    stats.dev === directory.dev &&
    stats.ino === directory.ino &&
    hasPrivatePermissions(stats, 0o700)
  );
}

function removeDirectory(directory: ResultDirectory): void {
  if (ownsDirectory(directory)) {
    fs.rmSync(directory.path, { recursive: true, force: true });
  }
}

function storeResult(result: NonNullable<Job['result']>): ResultSnapshot {
  const serialized = serializeResult(result);
  if (serialized === undefined) {
    throw new Error('Failed to store eval job result snapshot');
  }
  // Node's mode bits do not establish private Windows ACLs. Keep data off disk there.
  if (process.platform === 'win32') {
    return serialized;
  }
  let snapshot: DiskResultSnapshot | undefined;
  let descriptor: number | undefined;
  try {
    if (!resultDirectory || !ownsDirectory(resultDirectory)) {
      const directoryPath = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-job-results-'));
      const { dev, ino } = fs.lstatSync(directoryPath);
      const directory = { path: directoryPath, dev, ino };
      try {
        fs.chmodSync(directoryPath, 0o700);
        if (!ownsDirectory(directory)) {
          throw new Error('Snapshot directory is not private');
        }
      } catch (error) {
        removeDirectory(directory);
        throw error;
      }
      resultDirectory = directory;
      // Allocate a fresh path after cleanup or replacement. Never remove a
      // replacement at the old path, including during process-exit cleanup.
      if (!cleanupRegistered) {
        process.once('exit', () => {
          try {
            if (resultDirectory) {
              removeDirectory(resultDirectory);
            }
          } catch {
            // Cleanup at process exit is best effort.
          }
        });
        cleanupRegistered = true;
      }
    }
    snapshot = {
      path: path.join(resultDirectory.path, `${randomUUID()}.json`),
      directory: resultDirectory,
    };
    descriptor = fs.openSync(snapshot.path, 'wx', 0o600);
    try {
      if (!ownsDirectory(snapshot.directory)) {
        throw new Error('Snapshot directory was replaced');
      }
      const mode = fs.fstatSync(descriptor).mode & 0o600;
      if ((mode & 0o400) === 0) {
        // A restrictive umask can remove owner-read from the new snapshot.
        fs.fchmodSync(descriptor, mode | 0o400);
      }
      fs.writeFileSync(descriptor, serialized, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
    return snapshot;
  } catch {
    // An exclusive-open failure must never remove another snapshot's file.
    if (descriptor !== undefined) {
      removeResult(snapshot);
    }
    throw new Error('Failed to store eval job result snapshot');
  }
}

function removeResult(snapshot: ResultSnapshot | null | undefined): void {
  if (snapshot && typeof snapshot !== 'string') {
    try {
      if (ownsDirectory(snapshot.directory)) {
        fs.rmSync(snapshot.path, { force: true });
      }
    } catch {
      // Obsolete snapshot cleanup is best effort.
    }
  }
}

function readResult(snapshot: ResultSnapshot): Job['result'] {
  if (typeof snapshot === 'string') {
    return JSON.parse(snapshot);
  }
  if (!ownsDirectory(snapshot.directory) || !fs.lstatSync(snapshot.path).isFile()) {
    throw new Error('Snapshot path was replaced');
  }
  const descriptor = fs.openSync(
    snapshot.path,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0),
  );
  try {
    const stats = fs.fstatSync(descriptor);
    // Check the opened file itself before reading; a prior path check cannot
    // reject a foreign-owned file substituted while openSync resolves its parent.
    if (
      !stats.isFile() ||
      (!hasPrivatePermissions(stats, 0o600) && !hasPrivatePermissions(stats, 0o400)) ||
      !ownsDirectory(snapshot.directory)
    ) {
      throw new Error('Snapshot file is not private');
    }
    return JSON.parse(fs.readFileSync(descriptor, 'utf8'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function serializeResult(result: NonNullable<Job['result']>): string {
  const ancestors: unknown[] = [];
  return JSON.stringify(result, function (_key, value) {
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
}

function cloneJob(job: StoredJob): Job {
  const { resultSnapshot, ...fields } = job;
  return {
    ...fields,
    result: resultSnapshot === null ? null : readResult(resultSnapshot),
    logs: [...job.logs],
  };
}

export class EvalJobService {
  private jobs = new Map<string, StoredJob>();

  create(id: string): Job {
    const previous = this.jobs.get(id);
    const job: StoredJob = {
      evalId: null,
      status: 'in-progress',
      progress: 0,
      total: 0,
      resultSnapshot: null,
      logs: [],
    };
    this.jobs.set(id, job);
    removeResult(previous?.resultSnapshot);
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
    const resultSnapshot = result === null ? null : storeResult(result);
    const previousSnapshot = job.resultSnapshot;
    job.status = 'complete';
    job.resultSnapshot = resultSnapshot;
    job.evalId = evalId;
    removeResult(previousSnapshot);
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
        const previousSnapshot = job.resultSnapshot;
        job.resultSnapshot = null;
        job.evalId = null;
        removeResult(previousSnapshot);
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
