import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSignalFile } from '../src/database/signal';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';

import type { ApiProvider, TestSuite } from '../src/types';

// Only mock what we need to verify
vi.mock('../src/database/signal', () => ({
  updateSignalFile: vi.fn(),
  readSignalEvalId: vi.fn(),
}));

import { evaluate } from '../src/evaluator';
import { ResultFailureReason } from '../src/types';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

describe('evaluate SIGINT/abort handling', () => {
  beforeEach(async () => {
    await runDbMigrations();
    vi.clearAllMocks();
    vi.mocked(updateSignalFile).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return early when user aborts (not max-duration timeout)', async () => {
    const abortController = new AbortController();
    let providerCallCount = 0;

    // Provider that aborts after first successful call
    const testProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockImplementation(async () => {
        providerCallCount++;
        if (providerCallCount === 1) {
          // First call succeeds, then we trigger abort to simulate user SIGINT
          // Use setImmediate to abort after this call resolves
          setTimeout(() => abortController.abort(), 0);
          return {
            output: 'First response',
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
          };
        }
        // Second call will see the abort
        throw new Error('Operation cancelled');
      }),
    };

    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    const mockSetVars = vi.fn();
    const mockAddPrompts = vi.fn().mockResolvedValue(undefined);

    const mockEvalRecord = {
      id: 'test-eval-abort-123',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: mockAddPrompts,
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 1,
          failures: 0,
          errors: 0,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: mockSetVars,
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [testProvider],
      prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
      tests: [{}, {}], // Two tests - second should see abort
    };

    const result = await evaluate(testSuite, mockEvalRecord as unknown as Eval, {
      abortSignal: abortController.signal,
    });

    // Should return the eval record
    expect(result).toBeDefined();
    expect(result.id).toBe('test-eval-abort-123');

    // When user aborts (not timeout), should update signal file for resume
    expect(updateSignalFile).toHaveBeenCalledWith('test-eval-abort-123');

    // Should persist vars and prompts before early return
    expect(mockSetVars).toHaveBeenCalled();
    expect(mockAddPrompts).toHaveBeenCalled();
  });

  it('should continue normal flow and write timeout rows when per-call timeout triggers', async () => {
    // This test verifies that per-call timeouts (timeoutMs option) write
    // timeout error rows and continue the normal evaluation flow.
    //
    // Key difference from user SIGINT: evaluation continues normally and
    // updateSignalFile is called at the end of the normal flow (not during early return).
    // Both paths call updateSignalFile, just at different points.
    let longTimer: NodeJS.Timeout | null = null;

    const slowProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation(() => {
        // Long-running call that will be interrupted by timeout
        return new Promise((resolve) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
            });
          }, 5000); // 5 seconds - will be interrupted by 100ms timeout
        });
      }),
      cleanup: vi.fn(),
    };

    const mockAddResult = vi.fn().mockResolvedValue(undefined);

    const mockEvalRecord = {
      id: 'test-eval-timeout-123',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn(),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowProvider],
      prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
      tests: [{}],
    };

    try {
      // Use timeoutMs (per-call timeout) which triggers timeout for individual test cases
      // Unlike maxEvalTimeMs (max-duration), this doesn't abort the entire evaluation
      await evaluate(testSuite, mockEvalRecord as unknown as Eval, {
        timeoutMs: 100,
      });

      // When timeout triggers, should write timeout error row
      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('timed out'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );

      // Provider cleanup should be called
      expect(slowProvider.cleanup).toHaveBeenCalled();
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
    }
  });

  it('should honor external abortSignal and return partial results', async () => {
    const abortController = new AbortController();
    const resultsAdded: unknown[] = [];

    const testProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockImplementation(async (_prompt, _context, opts) => {
        // Check if already aborted
        if (opts?.abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Abort after returning first result
        if (resultsAdded.length === 1) {
          abortController.abort();
          throw new Error('Operation cancelled');
        }

        return {
          output: `Response ${resultsAdded.length}`,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        };
      }),
    };

    const mockAddResult = vi.fn().mockImplementation(async (result: unknown) => {
      resultsAdded.push(result);
    });

    const mockEvalRecord = {
      id: 'test-eval-partial-123',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: resultsAdded.length,
          failures: 0,
          errors: 0,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn(),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [testProvider],
      prompts: [{ raw: 'Test prompt', label: 'Test prompt' }],
      tests: [{}, {}, {}], // Three tests
    };

    await evaluate(testSuite, mockEvalRecord as unknown as Eval, {
      abortSignal: abortController.signal,
    });

    // Should have added at least one result before abort
    expect(resultsAdded.length).toBeGreaterThanOrEqual(1);

    // Signal file should be updated for resume capability
    expect(updateSignalFile).toHaveBeenCalledWith('test-eval-partial-123');
  });
});
