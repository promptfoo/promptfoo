import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, isCacheEnabled } from '../../src/cache';
import { evaluate } from '../../src/evaluator';
import logger from '../../src/logger';
import Eval from '../../src/models/eval';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';
import { ResultFailureReason } from '../../src/types/index';

import type { TestSuite } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchWithCache)
    .mockReset()
    .mockResolvedValue({
      data: { id: 'fixture-prediction', status: 'processing' },
      status: 200,
      statusText: 'OK',
      cached: false,
    });
  vi.mocked(isCacheEnabled).mockReset().mockReturnValue(false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Replicate evaluation cancellation', () => {
  it.each(['text', 'image', 'moderation'])(
    'stops %s creation/polling after the actual evaluation timeout',
    async (mode) => {
      const options = { config: { apiKey: 'fixture' } };
      const provider =
        mode === 'image'
          ? new ReplicateImageProvider('owner/model', options)
          : new ReplicateProvider('owner/model', options);
      const testSuite: TestSuite = {
        providers:
          mode === 'moderation'
            ? [
                {
                  id: () => 'fixture-target',
                  callApi: async () => ({ output: 'fixture response' }),
                },
              ]
            : [provider],
        prompts: [{ raw: 'fixture prompt', label: 'fixture prompt' }],
        tests:
          mode === 'moderation'
            ? [
                {
                  assert: [{ type: 'moderation' }],
                  options: { provider: new ReplicateModerationProvider('owner/model', options) },
                },
              ]
            : [{}],
      };
      const errorSpy = vi.spyOn(logger, 'error');
      const evalRecord = new Eval({});
      const result = evaluate(testSuite, evalRecord, { timeoutMs: 100, maxConcurrency: 1 });

      await vi.advanceTimersByTimeAsync(0);
      expect(fetchWithCache).toHaveBeenCalledTimes(2);
      const signal = vi.mocked(fetchWithCache).mock.calls[0][1]?.signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      await result;
      await vi.advanceTimersByTimeAsync(2000);

      expect(signal?.aborted).toBe(true);
      expect(fetchWithCache).toHaveBeenCalledTimes(2);
      const summary = await evalRecord.toEvaluateSummary();
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toMatchObject({
        error: expect.stringContaining('Evaluation timed out after 100ms'),
        failureReason: ResultFailureReason.ERROR,
        score: 0,
        success: false,
      });
      expect(
        errorSpy.mock.calls.some(
          ([message]) =>
            String(message).includes('Provider call failed during eval') ||
            String(message).includes('Assertion grading failed during eval'),
        ),
      ).toBe(false);
      expect(vi.mocked(fetchWithCache).mock.calls.map(([url]) => url)).toEqual([
        'https://api.replicate.com/v1/models/owner/model/predictions',
        'https://api.replicate.com/v1/predictions/fixture-prediction',
      ]);
    },
  );
});
