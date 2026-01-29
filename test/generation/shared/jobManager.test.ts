import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addJobLog,
  cleanupOldJobs,
  completeJob,
  createJob,
  deleteJob,
  failJob,
  generationJobs,
  getJob,
  listJobs,
  updateJobProgress,
} from '../../../src/generation/shared/jobManager';

import type { DatasetGenerationResult } from '../../../src/generation/types';

describe('jobManager', () => {
  beforeEach(() => {
    // Clear all jobs before each test
    generationJobs.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    generationJobs.clear();
  });

  describe('createJob', () => {
    it('should create a dataset job with correct initial state', () => {
      const job = createJob('dataset');

      expect(job).toMatchObject({
        type: 'dataset',
        status: 'pending',
        progress: 0,
        total: 0,
        logs: [],
      });
      expect(job.id).toBeDefined();
      expect(job.createdAt).toBeInstanceOf(Date);
      expect(job.updatedAt).toBeInstanceOf(Date);
    });

    it('should create an assertions job', () => {
      const job = createJob('assertions');
      expect(job.type).toBe('assertions');
    });

    it('should create a combined job', () => {
      const job = createJob('combined');
      expect(job.type).toBe('combined');
    });

    it('should store job in the jobs map', () => {
      const job = createJob('dataset');
      expect(generationJobs.get(job.id)).toBe(job);
    });
  });

  describe('getJob', () => {
    it('should return job by id', () => {
      const job = createJob('dataset');
      const retrieved = getJob(job.id);
      expect(retrieved).toBe(job);
    });

    it('should return undefined for non-existent job', () => {
      const result = getJob('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('updateJobProgress', () => {
    it('should update progress and status', () => {
      const job = createJob('dataset');
      const initialUpdatedAt = job.updatedAt;

      vi.advanceTimersByTime(100);
      updateJobProgress(job.id, 5, 10, 'Generating');

      expect(job.progress).toBe(5);
      expect(job.total).toBe(10);
      expect(job.phase).toBe('Generating');
      expect(job.status).toBe('in-progress');
      expect(job.updatedAt.getTime()).toBeGreaterThan(initialUpdatedAt.getTime());
    });

    it('should handle non-existent job gracefully', () => {
      // Should not throw
      expect(() => updateJobProgress('non-existent', 1, 10, 'phase')).not.toThrow();
    });
  });

  describe('completeJob', () => {
    it('should mark job as complete with result', () => {
      const job = createJob('dataset');
      const mockResult: DatasetGenerationResult = {
        testCases: [{ var1: 'value1' }],
        metadata: {
          totalGenerated: 1,
          durationMs: 1000,
          provider: 'test',
        },
      };

      vi.advanceTimersByTime(100);
      completeJob(job.id, mockResult);

      expect(job.status).toBe('complete');
      expect(job.result).toBe(mockResult);
    });
  });

  describe('failJob', () => {
    it('should mark job as error with error message', () => {
      const job = createJob('dataset');
      const error = new Error('Test error');

      failJob(job.id, error);

      expect(job.status).toBe('error');
      expect(job.error).toBe('Test error');
    });

    it('should handle string error', () => {
      const job = createJob('dataset');

      failJob(job.id, 'String error');

      expect(job.error).toBe('String error');
    });
  });

  describe('addJobLog', () => {
    it('should add log message to job', () => {
      const job = createJob('dataset');

      addJobLog(job.id, 'Log message 1');
      addJobLog(job.id, 'Log message 2');

      expect(job.logs).toEqual(['Log message 1', 'Log message 2']);
    });
  });

  describe('deleteJob', () => {
    it('should remove job from map', () => {
      const job = createJob('dataset');
      expect(generationJobs.has(job.id)).toBe(true);

      const result = deleteJob(job.id);

      expect(result).toBe(true);
      expect(generationJobs.has(job.id)).toBe(false);
    });

    it('should return false for non-existent job', () => {
      const result = deleteJob('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('listJobs', () => {
    it('should return all jobs when no filter', () => {
      createJob('dataset');
      createJob('assertions');
      createJob('combined');

      const jobs = listJobs();
      expect(jobs).toHaveLength(3);
    });

    it('should filter by type', () => {
      createJob('dataset');
      createJob('assertions');
      createJob('dataset');

      const jobs = listJobs({ type: 'dataset' });
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.type === 'dataset')).toBe(true);
    });

    it('should filter by status', () => {
      const job1 = createJob('dataset');
      const job2 = createJob('assertions');
      createJob('combined');

      completeJob(job1.id, {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'test' },
      });
      completeJob(job2.id, {
        assertions: [],
        metadata: { totalGenerated: 0, pythonConverted: 0, durationMs: 0, provider: 'test' },
      });

      const pendingJobs = listJobs({ status: 'pending' });
      expect(pendingJobs).toHaveLength(1);

      const completeJobs = listJobs({ status: 'complete' });
      expect(completeJobs).toHaveLength(2);
    });

    it('should filter by both type and status', () => {
      const job1 = createJob('dataset');
      createJob('dataset');
      createJob('assertions');

      completeJob(job1.id, {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'test' },
      });

      const jobs = listJobs({ type: 'dataset', status: 'pending' });
      expect(jobs).toHaveLength(1);
    });
  });

  describe('cleanupOldJobs', () => {
    it('should remove completed jobs older than specified age', () => {
      const oldJob = createJob('dataset');
      // Complete the old job so it can be cleaned up
      completeJob(oldJob.id, {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'test' },
      });
      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
      const newJob = createJob('dataset');
      // Complete the new job as well
      completeJob(newJob.id, {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'test' },
      });

      // Cleanup jobs older than 5 minutes
      const cleaned = cleanupOldJobs(5 * 60 * 1000);

      expect(cleaned).toBe(1);
      expect(generationJobs.has(oldJob.id)).toBe(false);
      expect(generationJobs.has(newJob.id)).toBe(true);
    });

    it('should not remove pending jobs', () => {
      const pendingJob = createJob('dataset');
      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes - older than threshold

      // Cleanup should not remove pending jobs even if old
      const cleaned = cleanupOldJobs(5 * 60 * 1000);

      expect(cleaned).toBe(0);
      expect(generationJobs.has(pendingJob.id)).toBe(true);
    });

    it('should not remove recent completed jobs', () => {
      const job1 = createJob('dataset');
      const job2 = createJob('assertions');
      completeJob(job1.id, {
        testCases: [],
        metadata: { totalGenerated: 0, durationMs: 0, provider: 'test' },
      });
      completeJob(job2.id, {
        assertions: [],
        metadata: { totalGenerated: 0, pythonConverted: 0, durationMs: 0, provider: 'test' },
      });
      vi.advanceTimersByTime(1000); // 1 second

      const cleaned = cleanupOldJobs(5 * 60 * 1000);

      expect(cleaned).toBe(0);
      expect(generationJobs.size).toBe(2);
    });
  });
});
