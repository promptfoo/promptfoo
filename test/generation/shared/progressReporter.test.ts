import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as jobManager from '../../../src/generation/shared/jobManager';
import {
  createCallbackProgressReporter,
  createCliProgressReporter,
  createNoOpProgressReporter,
  ProgressReporter,
} from '../../../src/generation/shared/progressReporter';

vi.mock('../../../src/generation/shared/jobManager', () => ({
  updateJobProgress: vi.fn(),
}));

describe('progressReporter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('ProgressReporter', () => {
    it('should initialize with default values', () => {
      const reporter = new ProgressReporter({});

      expect(reporter).toBeDefined();
    });

    it('should call callback when started', async () => {
      const callback = vi.fn();
      const reporter = new ProgressReporter({ callback });

      await reporter.start(10, 'Starting');

      expect(callback).toHaveBeenCalledWith(0, 10, 'Starting');
    });

    it('should call callback when updated', async () => {
      const callback = vi.fn();
      const reporter = new ProgressReporter({ callback });

      await reporter.start(10, 'Starting');
      reporter.update(5, 'Midway');

      expect(callback).toHaveBeenCalledWith(5, 10, 'Midway');
    });

    it('should call callback with same phase when phase not provided in update', async () => {
      const callback = vi.fn();
      const reporter = new ProgressReporter({ callback });

      await reporter.start(10, 'Starting');
      reporter.update(5);

      expect(callback).toHaveBeenCalledWith(5, 10, 'Starting');
    });

    it('should increment progress', async () => {
      const callback = vi.fn();
      const reporter = new ProgressReporter({ callback });

      await reporter.start(10, 'Starting');
      reporter.increment();
      reporter.increment();

      expect(callback).toHaveBeenCalledWith(1, 10, 'Starting');
      expect(callback).toHaveBeenCalledWith(2, 10, 'Starting');
    });

    it('should update job progress when jobId is provided', async () => {
      const reporter = new ProgressReporter({ jobId: 'test-job-id' });

      await reporter.start(10, 'Starting');
      reporter.update(5, 'Midway');

      expect(jobManager.updateJobProgress).toHaveBeenCalledWith('test-job-id', 0, 10, 'Starting');
      expect(jobManager.updateJobProgress).toHaveBeenCalledWith('test-job-id', 5, 10, 'Midway');
    });

    it('should not throw when calling stop', async () => {
      const reporter = new ProgressReporter({});

      await reporter.start(10, 'Starting');
      expect(() => reporter.stop()).not.toThrow();
    });

    it('should get progress info', async () => {
      const reporter = new ProgressReporter({});

      await reporter.start(10, 'Phase 1');
      reporter.update(5);

      const progress = reporter.getProgress();
      expect(progress.current).toBe(5);
      expect(progress.total).toBe(10);
      expect(progress.phase).toBe('Phase 1');
      expect(progress.percentage).toBe(50);
    });
  });

  describe('createCallbackProgressReporter', () => {
    it('should create a ProgressReporter with callback', async () => {
      const callback = vi.fn();
      const reporter = createCallbackProgressReporter(callback);

      expect(reporter).toBeInstanceOf(ProgressReporter);

      await reporter.start(5, 'Test');
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('createCliProgressReporter', () => {
    it('should create a ProgressReporter for CLI', () => {
      const reporter = createCliProgressReporter();

      expect(reporter).toBeInstanceOf(ProgressReporter);
    });
  });

  describe('createNoOpProgressReporter', () => {
    it('should create a ProgressReporter that does nothing', async () => {
      const reporter = createNoOpProgressReporter();

      expect(reporter).toBeInstanceOf(ProgressReporter);

      // Should not throw
      await reporter.start(10, 'Starting');
      reporter.update(5);
      reporter.increment();
      reporter.stop();
    });
  });
});
