import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_TRANSFORM_TOKEN_USAGE_KEY } from '../../../src/redteam/shared/runtimeTransform';
import {
  addIndirectWebPwnTestCases,
  clearPageState,
} from '../../../src/redteam/strategies/indirectWebPwn';

const mockFetchWithRetries = vi.hoisted(() => vi.fn());

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: (...args: unknown[]) => mockFetchWithRetries(...args),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://mocked.task.api'),
}));

function mockJsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('addIndirectWebPwnTestCases token usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPageState();
  });

  it('preserves failed create-page helper usage for runtime transforms', async () => {
    mockFetchWithRetries.mockResolvedValueOnce(
      mockJsonResponse(
        {
          message: 'Internal Server Error',
          tokenUsage: { total: 15, prompt: 10, completion: 5, numRequests: 1 },
        },
        false,
      ),
    );

    const [result] = await addIndirectWebPwnTestCases(
      [
        {
          vars: { prompt: 'attack prompt' },
          metadata: {
            pluginId: 'runtime-transform',
            evaluationId: 'eval-1',
            testCaseId: 'tc-1',
          },
        },
      ],
      'prompt',
      {},
    );

    expect(result?.vars?.prompt).toBe('attack prompt');
    expect(result?.metadata?.[RUNTIME_TRANSFORM_TOKEN_USAGE_KEY]).toEqual({
      total: 15,
      prompt: 10,
      completion: 5,
      numRequests: 1,
    });
  });

  it('preserves failed update-page helper usage for runtime transforms', async () => {
    mockFetchWithRetries
      .mockResolvedValueOnce(
        mockJsonResponse({
          uuid: 'web-123',
          fullUrl: 'https://example.com/dynamic-pages/eval-1/web-123',
          path: '/dynamic-pages/eval-1/web-123',
          fetchPrompt: 'Please fetch https://example.com/dynamic-pages/eval-1/web-123',
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            message: 'Internal Server Error',
            tokenUsage: { total: 17, prompt: 11, completion: 6, numRequests: 1 },
          },
          false,
        ),
      );

    await addIndirectWebPwnTestCases(
      [
        {
          vars: { prompt: 'attack prompt 1' },
          metadata: {
            pluginId: 'runtime-transform',
            evaluationId: 'eval-1',
            testCaseId: 'tc-1',
          },
        },
      ],
      'prompt',
      {},
    );

    const [result] = await addIndirectWebPwnTestCases(
      [
        {
          vars: { prompt: 'attack prompt 2' },
          metadata: {
            pluginId: 'runtime-transform',
            evaluationId: 'eval-1',
            testCaseId: 'tc-1',
          },
        },
      ],
      'prompt',
      {},
    );

    expect(result?.vars?.prompt).toBe(
      'Please fetch https://example.com/dynamic-pages/eval-1/web-123',
    );
    expect(result?.metadata?.[RUNTIME_TRANSFORM_TOKEN_USAGE_KEY]).toEqual({
      total: 17,
      prompt: 11,
      completion: 6,
      numRequests: 1,
    });
  });
});
