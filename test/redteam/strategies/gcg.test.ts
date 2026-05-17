import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchWithCacheResult, fetchWithCache } from '../../../src/cache';
import { getUserEmail, isLoggedIntoCloud } from '../../../src/globalConfig/accounts';
import logger from '../../../src/logger';
import {
  getRemoteGenerationExplicitlyDisabledError,
  getRemoteGenerationUrl,
  neverGenerateRemote,
} from '../../../src/redteam/remoteGeneration';
import { addGcgTestCases, CONCURRENCY } from '../../../src/redteam/strategies/gcg';

import type { TestCase } from '../../../src/types/index';

type GcgGenerationResponse = {
  responses: string[];
};

vi.mock('../../../src/cache');
vi.mock('../../../src/globalConfig/accounts');
vi.mock('../../../src/redteam/remoteGeneration');
vi.mock('cli-progress');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

function stringifyLoggerCalls(...mocks: ReturnType<typeof vi.fn>[]) {
  return JSON.stringify(
    mocks.flatMap((mock) => mock.mock.calls),
    (_key, value) =>
      value instanceof Error
        ? { ...value, name: value.name, message: value.message, stack: value.stack }
        : value,
  );
}

describe('gcg strategy', () => {
  const mockFetchWithCache = vi.mocked(fetchWithCache);
  const mockGetUserEmail = vi.mocked(getUserEmail);
  const mockIsLoggedIntoCloud = vi.mocked(isLoggedIntoCloud);
  const mockNeverGenerateRemote = vi.mocked(neverGenerateRemote);
  const mockGetRemoteGenerationUrl = vi.mocked(getRemoteGenerationUrl);
  const mockGetRemoteGenerationExplicitlyDisabledError = vi.mocked(
    getRemoteGenerationExplicitlyDisabledError,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserEmail.mockReturnValue('test@example.com');
    mockIsLoggedIntoCloud.mockReturnValue(true);
    mockNeverGenerateRemote.mockReturnValue(false);
    mockGetRemoteGenerationUrl.mockReturnValue('http://test-url');
    mockGetRemoteGenerationExplicitlyDisabledError.mockImplementation(
      (strategyName) =>
        `${strategyName} requires remote generation, which has been explicitly disabled.`,
    );
  });

  const testCases: TestCase[] = [
    {
      vars: {
        prompt: 'original prompt',
      },
      assert: [
        {
          type: 'equals',
          value: 'expected',
          metric: 'test-metric',
        },
      ],
    },
  ];

  it('should generate GCG test cases successfully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response 1', 'generated response 2'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result?.[0]?.vars?.prompt).toBe('generated response 1');
    expect(result?.[1]?.vars?.prompt).toBe('generated response 2');
    expect(result?.[0]?.metadata?.strategyId).toBe('gcg');
    expect(result?.[0]?.assert?.[0].metric).toBe('test-metric/GCG');

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promptfoo-silent': 'true',
        },
        body: JSON.stringify({
          task: 'gcg',
          query: 'original prompt',
          email: 'test@example.com',
        }),
      },
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should throw error when user is not authenticated', async () => {
    mockIsLoggedIntoCloud.mockReturnValue(false);

    await expect(addGcgTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'The GCG strategy requires authentication',
    );
  });

  it('should throw error when remote generation is disabled', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);

    await expect(addGcgTestCases(testCases, 'prompt', {})).rejects.toThrow(
      'GCG strategy requires remote generation, which has been explicitly disabled.',
    );
  });

  it('should handle API errors gracefully', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: { error: 'API Error' },
      cached: false,
      status: 500,
      statusText: 'Error',
    });

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith('No GCG test cases were generated');
  });

  it('redacts prompts and generated responses from logs', async () => {
    const secretInjectVar = 'SECRET_GCG_INJECT_VAR';
    const originalPrompt = 'SECRET_GCG_ORIGINAL_PROMPT';
    const generatedResponse = 'SECRET_GCG_GENERATED_RESPONSE';
    const metadataSecretKey = 'SECRET_GCG_METADATA_KEY';
    const metadataSecret = 'SECRET_GCG_METADATA_VALUE';
    const assertionSecret = 'SECRET_GCG_ASSERTION_VALUE';

    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: [generatedResponse],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addGcgTestCases(
      [
        {
          vars: {
            [secretInjectVar]: originalPrompt,
          },
          assert: [
            {
              type: 'contains',
              value: assertionSecret,
              metric: 'secret-metric',
            },
          ],
          metadata: {
            pluginId: 'plugin-secret-key',
            [metadataSecretKey]: metadataSecret,
          },
        },
      ],
      secretInjectVar,
      {},
    );

    expect(result[0].vars?.[secretInjectVar]).toBe(generatedResponse);
    expect(logger.debug).toHaveBeenCalledWith(
      '[GCG] Processing test case',
      expect.objectContaining({
        hasInjectVar: true,
        varsKeyCount: 1,
        assertionCount: 1,
        metadataKeyCount: 2,
      }),
    );
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-promptfoo-silent': 'true',
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );

    const logs = stringifyLoggerCalls(vi.mocked(logger.debug), vi.mocked(logger.error));
    expect(logs).not.toContain(secretInjectVar);
    expect(logs).not.toContain(originalPrompt);
    expect(logs).not.toContain(generatedResponse);
    expect(logs).not.toContain(metadataSecretKey);
    expect(logs).not.toContain(metadataSecret);
    expect(logs).not.toContain(assertionSecret);
  });

  it('redacts remote error bodies from logs', async () => {
    const remoteError = 'SECRET_GCG_REMOTE_ERROR_WITH_PROMPT';

    mockFetchWithCache.mockResolvedValueOnce({
      data: { error: remoteError },
      cached: false,
      status: 500,
      statusText: 'Error',
    });

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith('[GCG] Error in GCG generation', {
      caseNumber: 1,
      status: 500,
      statusText: 'Error',
    });
    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-promptfoo-silent': 'true',
        }),
      }),
      expect.any(Number),
      'json',
      true,
    );

    const logs = stringifyLoggerCalls(vi.mocked(logger.debug), vi.mocked(logger.error));
    expect(logs).not.toContain(remoteError);
  });

  it('should handle network errors gracefully', async () => {
    mockFetchWithCache.mockRejectedValueOnce(
      new Error('Network error with SECRET_GCG_THROWN_ERROR'),
    );

    const result = await addGcgTestCases(testCases, 'prompt', {});

    expect(result).toHaveLength(0);
    expect(logger.error).toHaveBeenCalledWith('Error in GCG generation', {
      errorType: 'Error',
    });

    const logs = stringifyLoggerCalls(vi.mocked(logger.debug), vi.mocked(logger.error));
    expect(logs).not.toContain('SECRET_GCG_THROWN_ERROR');
  });

  it('should respect configuration options', async () => {
    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const config = { n: 1 };
    await addGcgTestCases(testCases, 'prompt', config);

    expect(mockFetchWithCache).toHaveBeenCalledWith(
      'http://test-url',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-promptfoo-silent': 'true',
        },
        body: JSON.stringify({
          task: 'gcg',
          query: 'original prompt',
          n: 1,
          email: 'test@example.com',
        }),
      },
      expect.any(Number),
      'json',
      true,
    );
  });

  it('should handle test cases without assert property', async () => {
    const testCasesWithoutAssert: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt',
        },
      },
    ];

    mockFetchWithCache.mockResolvedValueOnce({
      data: {
        responses: ['generated response'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await addGcgTestCases(testCasesWithoutAssert, 'prompt', {});

    expect(result?.[0]?.vars?.prompt).toBe('generated response');
    expect(result?.[0]?.assert).toBeUndefined();
  });

  it('should maintain concurrency limit', async () => {
    const manyTestCases = Array(CONCURRENCY * 2).fill(testCases[0]);
    const mockResponses = Array(CONCURRENCY * 2).fill(['response']);

    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;
    // Concurrency barrier: hold every in-flight call until CONCURRENCY of them
    // have started, then release that wave together. If the SUT exceeds the
    // limit, maxConcurrentCalls will record the violation regardless of pacing.
    let releaseWave: (() => void) | undefined;
    let waveBarrier = new Promise<void>((resolve) => {
      releaseWave = resolve;
    });

    mockFetchWithCache.mockImplementation(async function (): Promise<
      FetchWithCacheResult<GcgGenerationResponse>
    > {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      if (concurrentCalls >= CONCURRENCY) {
        releaseWave?.();
      }
      let resolveFallback!: () => void;
      const fallback = new Promise<void>((r) => {
        resolveFallback = r;
      });
      const fallbackHandle = setTimeout(() => resolveFallback(), 100);
      try {
        await Promise.race([waveBarrier, fallback]);
      } finally {
        clearTimeout(fallbackHandle);
      }
      concurrentCalls--;
      // Reset the barrier for the next wave so a slow SUT can still progress.
      if (concurrentCalls === 0) {
        waveBarrier = new Promise<void>((resolve) => {
          releaseWave = resolve;
        });
      }
      return {
        data: { responses: mockResponses[0] },
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });

    await addGcgTestCases(manyTestCases, 'prompt', {});

    expect(maxConcurrentCalls).toBeLessThanOrEqual(CONCURRENCY);
  });
});
