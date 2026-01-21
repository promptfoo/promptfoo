import { EventEmitter } from 'events';

import logger from '../../logger';

import type { Assertion, VarMapping } from '../../types';
import type {
  AssertionGenerationResult,
  DatasetGenerationResult,
  GenerationJob,
  GenerationJobStatus,
  GenerationJobType,
  TestSuiteGenerationResult,
} from '../types';

/**
 * In-memory storage for generation jobs.
 * Jobs are tracked for async operations via the server API.
 */
export const generationJobs = new Map<string, GenerationJob>();

/**
 * Event emitter for streaming job events.
 * Clients can subscribe to events for real-time updates.
 */
export const jobEventEmitter = new EventEmitter();

// Increase max listeners since many SSE clients might connect
jobEventEmitter.setMaxListeners(100);

/**
 * Job event types for SSE streaming.
 */
export interface JobProgressEvent {
  type: 'progress';
  jobId: string;
  current: number;
  total: number;
  phase: string;
}

export interface JobTestCaseEvent {
  type: 'testcase';
  jobId: string;
  testCase: VarMapping;
  index: number;
}

export interface JobAssertionEvent {
  type: 'assertion';
  jobId: string;
  assertion: Assertion;
  index: number;
}

export interface JobCompleteEvent {
  type: 'complete';
  jobId: string;
  result: DatasetGenerationResult | AssertionGenerationResult | TestSuiteGenerationResult;
}

export interface JobErrorEvent {
  type: 'error';
  jobId: string;
  error: string;
}

export type JobEvent =
  | JobProgressEvent
  | JobTestCaseEvent
  | JobAssertionEvent
  | JobCompleteEvent
  | JobErrorEvent;

/**
 * Emits a job event for SSE streaming.
 */
export function emitJobEvent(event: JobEvent): void {
  jobEventEmitter.emit(`job:${event.jobId}`, event);
  logger.debug(`Job event emitted: ${event.type} for job ${event.jobId}`);
}

/**
 * Emits a test case event for incremental streaming.
 */
export function emitTestCase(jobId: string, testCase: VarMapping, index: number): void {
  emitJobEvent({
    type: 'testcase',
    jobId,
    testCase,
    index,
  });
}

/**
 * Emits an assertion event for incremental streaming.
 */
export function emitAssertion(jobId: string, assertion: Assertion, index: number): void {
  emitJobEvent({
    type: 'assertion',
    jobId,
    assertion,
    index,
  });
}

/**
 * Creates a new generation job.
 *
 * @param type - The type of generation job ('dataset', 'assertions', or 'combined')
 * @returns The created job with a unique ID
 */
export function createJob(type: GenerationJobType): GenerationJob {
  const id = crypto.randomUUID();
  const now = new Date();

  const job: GenerationJob = {
    id,
    type,
    status: 'pending',
    progress: 0,
    total: 0,
    phase: 'Initializing...',
    result: undefined,
    error: undefined,
    logs: [],
    createdAt: now,
    updatedAt: now,
  };

  generationJobs.set(id, job);
  logger.debug(`Created generation job: ${id} (type: ${type})`);

  return job;
}

/**
 * Updates the progress of a generation job.
 *
 * @param jobId - The job ID
 * @param current - Current progress count
 * @param total - Total expected count
 * @param phase - Optional phase description
 */
export function updateJobProgress(
  jobId: string,
  current: number,
  total: number,
  phase?: string,
): void {
  const job = generationJobs.get(jobId);
  if (!job) {
    logger.warn(`Cannot update progress for unknown job: ${jobId}`);
    return;
  }

  job.progress = current;
  job.total = total;
  job.status = 'in-progress';
  if (phase) {
    job.phase = phase;
  }
  job.updatedAt = new Date();

  // Emit progress event for SSE streaming
  emitJobEvent({
    type: 'progress',
    jobId,
    current,
    total,
    phase: job.phase || 'Processing...',
  });

  logger.debug(`Job ${jobId} progress: ${current}/${total} (${phase || 'no phase'})`);
}

/**
 * Marks a job as complete with results.
 *
 * @param jobId - The job ID
 * @param result - The generation result
 */
export function completeJob(
  jobId: string,
  result: DatasetGenerationResult | AssertionGenerationResult | TestSuiteGenerationResult,
): void {
  const job = generationJobs.get(jobId);
  if (!job) {
    logger.warn(`Cannot complete unknown job: ${jobId}`);
    return;
  }

  job.status = 'complete';
  job.result = result;
  job.updatedAt = new Date();
  job.progress = job.total;

  // Emit complete event for SSE streaming
  emitJobEvent({
    type: 'complete',
    jobId,
    result,
  });

  logger.debug(`Job ${jobId} completed`);
}

/**
 * Marks a job as failed with an error.
 *
 * @param jobId - The job ID
 * @param error - Error message or Error object
 */
export function failJob(jobId: string, error: string | Error): void {
  const job = generationJobs.get(jobId);
  if (!job) {
    logger.warn(`Cannot fail unknown job: ${jobId}`);
    return;
  }

  const errorMessage = typeof error === 'string' ? error : error.message;
  job.status = 'error';
  job.error = errorMessage;
  job.logs.push(`Error: ${errorMessage}`);
  job.updatedAt = new Date();

  // Emit error event for SSE streaming
  emitJobEvent({
    type: 'error',
    jobId,
    error: errorMessage,
  });

  logger.error(`Job ${jobId} failed: ${errorMessage}`);
}

/**
 * Adds a log entry to a job.
 *
 * @param jobId - The job ID
 * @param message - Log message
 */
export function addJobLog(jobId: string, message: string): void {
  const job = generationJobs.get(jobId);
  if (!job) {
    return;
  }

  job.logs.push(message);
  job.updatedAt = new Date();
}

/**
 * Retrieves a job by ID.
 *
 * @param jobId - The job ID
 * @returns The job if found, undefined otherwise
 */
export function getJob(jobId: string): GenerationJob | undefined {
  return generationJobs.get(jobId);
}

/**
 * Updates the status of a job.
 *
 * @param jobId - The job ID
 * @param status - New status
 */
export function updateJobStatus(jobId: string, status: GenerationJobStatus): void {
  const job = generationJobs.get(jobId);
  if (!job) {
    logger.warn(`Cannot update status for unknown job: ${jobId}`);
    return;
  }

  job.status = status;
  job.updatedAt = new Date();
}

/**
 * Deletes a job from storage.
 * Useful for cleaning up completed or old jobs.
 *
 * @param jobId - The job ID
 * @returns true if the job was deleted, false if not found
 */
export function deleteJob(jobId: string): boolean {
  return generationJobs.delete(jobId);
}

/**
 * Lists all jobs, optionally filtered by type or status.
 *
 * @param filter - Optional filter criteria
 * @returns Array of matching jobs
 */
export function listJobs(filter?: {
  type?: GenerationJobType;
  status?: GenerationJobStatus;
}): GenerationJob[] {
  const jobs = Array.from(generationJobs.values());

  if (!filter) {
    return jobs;
  }

  return jobs.filter((job) => {
    if (filter.type && job.type !== filter.type) {
      return false;
    }
    if (filter.status && job.status !== filter.status) {
      return false;
    }
    return true;
  });
}

/**
 * Cleans up old jobs that are complete or errored.
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns Number of jobs cleaned up
 */
export function cleanupOldJobs(maxAgeMs: number = 60 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, job] of generationJobs.entries()) {
    if (
      (job.status === 'complete' || job.status === 'error') &&
      now - job.updatedAt.getTime() > maxAgeMs
    ) {
      generationJobs.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`Cleaned up ${cleaned} old generation jobs`);
  }

  return cleaned;
}

/**
 * Auto-cleanup interval reference.
 * Stored so it can be cancelled if needed (e.g., during tests).
 */
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Starts automatic cleanup of old generation jobs.
 * Runs every 15 minutes by default, cleaning up jobs older than 1 hour.
 *
 * @param intervalMs - Cleanup check interval in milliseconds (default: 15 minutes)
 * @param maxAgeMs - Maximum age before cleanup in milliseconds (default: 1 hour)
 */
export function startAutoCleanup(
  intervalMs: number = 15 * 60 * 1000,
  maxAgeMs: number = 60 * 60 * 1000,
): void {
  // Don't start multiple cleanup intervals
  if (cleanupIntervalId) {
    return;
  }

  cleanupIntervalId = setInterval(() => {
    cleanupOldJobs(maxAgeMs);
  }, intervalMs);

  // Ensure the interval doesn't prevent Node.js from exiting
  if (typeof cleanupIntervalId.unref === 'function') {
    cleanupIntervalId.unref();
  }

  logger.debug('Auto-cleanup started for generation jobs');
}

/**
 * Stops automatic cleanup of generation jobs.
 */
export function stopAutoCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    logger.debug('Auto-cleanup stopped for generation jobs');
  }
}

// Start auto-cleanup when this module is loaded
startAutoCleanup();
