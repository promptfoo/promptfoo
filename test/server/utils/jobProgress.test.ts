import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInitialMetrics,
  addJobError,
  detectPhaseFromLog,
  detectErrorFromLog,
} from '../../../src/server/utils/jobProgress';
import type { Job } from '../../../src/types';

describe('jobProgress utilities', () => {
  describe('createInitialMetrics', () => {
    it('should return a metrics object with all counts at zero', () => {
      const metrics = createInitialMetrics();

      expect(metrics.testPassCount).toBe(0);
      expect(metrics.testFailCount).toBe(0);
      expect(metrics.testErrorCount).toBe(0);
      expect(metrics.totalLatencyMs).toBe(0);
    });

    it('should return a metrics object with zero token usage', () => {
      const metrics = createInitialMetrics();

      expect(metrics.tokenUsage.total).toBe(0);
      expect(metrics.tokenUsage.prompt).toBe(0);
      expect(metrics.tokenUsage.completion).toBe(0);
      expect(metrics.tokenUsage.numRequests).toBe(0);
    });
  });

  describe('addJobError', () => {
    let job: Job;

    beforeEach(() => {
      job = {
        evalId: null,
        status: 'in-progress',
        progress: 0,
        total: 0,
        result: null,
        logs: [],
      };
    });

    it('should add a new error to an empty errors array', () => {
      addJobError(job, 'rate_limit', 'Rate limit exceeded');

      expect(job.errors).toHaveLength(1);
      expect(job.errors![0].type).toBe('rate_limit');
      expect(job.errors![0].message).toBe('Rate limit exceeded');
      expect(job.errors![0].count).toBe(1);
      expect(job.errors![0].timestamp).toBeDefined();
    });

    it('should initialize errors array if undefined', () => {
      expect(job.errors).toBeUndefined();

      addJobError(job, 'timeout', 'Request timed out');

      expect(job.errors).toBeDefined();
      expect(job.errors).toHaveLength(1);
    });

    it('should deduplicate errors with same type and message', () => {
      addJobError(job, 'rate_limit', 'Rate limit exceeded');
      addJobError(job, 'rate_limit', 'Rate limit exceeded');
      addJobError(job, 'rate_limit', 'Rate limit exceeded');

      expect(job.errors).toHaveLength(1);
      expect(job.errors![0].count).toBe(3);
    });

    it('should not deduplicate errors with different types', () => {
      addJobError(job, 'rate_limit', 'Error occurred');
      addJobError(job, 'timeout', 'Error occurred');

      expect(job.errors).toHaveLength(2);
    });

    it('should not deduplicate errors with different messages', () => {
      addJobError(job, 'rate_limit', 'Rate limit exceeded - provider A');
      addJobError(job, 'rate_limit', 'Rate limit exceeded - provider B');

      expect(job.errors).toHaveLength(2);
    });

    it('should update timestamp when incrementing count', () => {
      addJobError(job, 'rate_limit', 'Rate limit exceeded');
      const firstTimestamp = job.errors![0].timestamp;

      // Add a small delay to ensure timestamp difference
      const later = Date.now() + 100;
      vi.setSystemTime(later);

      addJobError(job, 'rate_limit', 'Rate limit exceeded');

      expect(job.errors![0].timestamp).toBeGreaterThanOrEqual(firstTimestamp);
    });
  });

  describe('detectPhaseFromLog', () => {
    it('should detect generating phase from "Generating test cases"', () => {
      const result = detectPhaseFromLog('Generating test cases for evaluation', 'initializing');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('generating');
      expect(result!.detail).toBe('Initializing test generation...');
    });

    it('should detect generating phase from "Extracting system purpose"', () => {
      const result = detectPhaseFromLog('Extracting system purpose from target', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('generating');
      expect(result!.detail).toBe('Extracting system purpose...');
    });

    it('should detect generating phase from "Extracting entities"', () => {
      const result = detectPhaseFromLog('Extracting entities from context', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('generating');
      expect(result!.detail).toBe('Extracting entities...');
    });

    it('should detect generating phase with plugin name from "Generating tests for"', () => {
      const result = detectPhaseFromLog('Generating tests for pii plugin', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('generating');
      expect(result!.detail).toBe('Generating pii tests...');
    });

    it('should detect generating phase with strategy from "Generating X tests"', () => {
      const result = detectPhaseFromLog('Generating jailbreak tests', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('generating');
      expect(result!.detail).toBe('Applying jailbreak strategy...');
    });

    it('should not match strategy pattern when "Generating tests for" is present', () => {
      const result = detectPhaseFromLog('Generating tests for pii', 'generating');

      expect(result).not.toBeNull();
      expect(result!.detail).toBe('Generating pii tests...');
      expect(result!.detail).not.toContain('Applying');
    });

    it('should detect evaluating phase from "Running scan"', () => {
      const result = detectPhaseFromLog('Running scan on target', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('evaluating');
      expect(result!.detail).toBe('Starting evaluation...');
    });

    it('should detect evaluating phase from "Evaluating"', () => {
      const result = detectPhaseFromLog('Evaluating test case 5/10', 'generating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('evaluating');
      expect(result!.detail).toBeUndefined();
    });

    it('should detect complete phase from "Red team scan complete"', () => {
      const result = detectPhaseFromLog('Red team scan complete', 'evaluating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('complete');
    });

    it('should preserve current phase on rate limit detection', () => {
      const result = detectPhaseFromLog('Error: rate limit exceeded', 'evaluating');

      expect(result).not.toBeNull();
      expect(result!.phase).toBe('evaluating');
    });

    it('should return null for unrecognized log messages', () => {
      const result = detectPhaseFromLog('Some random log message', 'generating');

      expect(result).toBeNull();
    });

    it('should be case-insensitive for rate limit detection', () => {
      const result1 = detectPhaseFromLog('RATE LIMIT exceeded', 'evaluating');
      const result2 = detectPhaseFromLog('Rate Limit Exceeded', 'evaluating');

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe('detectErrorFromLog', () => {
    it('should detect rate limit errors', () => {
      const result = detectErrorFromLog('Error: rate limit exceeded');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('rate_limit');
      expect(result!.message).toBe('Rate limit exceeded');
    });

    it('should detect rate limit errors case-insensitively', () => {
      const result = detectErrorFromLog('RATE LIMIT hit');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('rate_limit');
    });

    it('should detect timeout errors', () => {
      const result = detectErrorFromLog('Request timeout after 30s');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('timeout');
      expect(result!.message).toBe('Request timed out');
    });

    it('should detect target errors', () => {
      const result = detectErrorFromLog('Error connecting to target endpoint');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('target_error');
      expect(result!.message).toBe('Error connecting to target endpoint');
    });

    it('should detect grader errors', () => {
      const result = detectErrorFromLog('Error in grading response');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('grader_error');
      expect(result!.message).toBe('Error in grading response');
    });

    it('should detect generic errors starting with "Error:"', () => {
      const result = detectErrorFromLog('Error: Something went wrong');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('unknown');
      expect(result!.message).toBe('Something went wrong');
    });

    it('should trim message for generic errors', () => {
      const result = detectErrorFromLog('Error:   Trimmed message  ');

      expect(result).not.toBeNull();
      expect(result!.message).toBe('Trimmed message');
    });

    it('should return null for non-error messages', () => {
      const result = detectErrorFromLog('Successfully completed task');

      expect(result).toBeNull();
    });

    it('should return null for messages with "error" not at the start', () => {
      const result = detectErrorFromLog('No error occurred');

      // This will match because it contains "error"
      expect(result).toBeNull();
    });

    it('should prioritize rate_limit over other error types', () => {
      // Rate limit should be detected first
      const result = detectErrorFromLog('rate limit error from target');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('rate_limit');
    });
  });
});
