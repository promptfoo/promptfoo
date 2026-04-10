import { beforeEach, describe, expect, it, vi } from 'vitest';
import IndirectWebPwnProvider from '../../../src/redteam/providers/indirectWebPwn';

import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../../src/types/index';

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

describe('IndirectWebPwnProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should count one probe per target fetch attempt', async () => {
    mockFetchWithRetries
      // create-web-page
      .mockResolvedValueOnce(
        mockJsonResponse({
          uuid: 'web-123',
          fullUrl: 'https://example.com/dynamic-pages/eval-1/web-123',
          path: '/dynamic-pages/eval-1/web-123',
          fetchPrompt: 'Please fetch https://example.com/dynamic-pages/eval-1/web-123',
        }),
      )
      // tracking for attempt 1
      .mockResolvedValueOnce(mockJsonResponse({ wasFetched: false, fetchCount: 0 }))
      // tracking for attempt 2
      .mockResolvedValueOnce(mockJsonResponse({ wasFetched: true, fetchCount: 1 }));

    const targetProvider: ApiProvider = {
      id: () => 'mock-target',
      callApi: vi
        .fn<() => Promise<ProviderResponse>>()
        .mockResolvedValueOnce({
          output: 'Attempt 1 output',
          tokenUsage: { total: 10, prompt: 4, completion: 6 },
        })
        .mockResolvedValueOnce({
          output: 'Attempt 2 output',
          tokenUsage: { total: 20, prompt: 8, completion: 12 },
        }),
    };

    const provider = new IndirectWebPwnProvider({
      injectVar: 'query',
      maxFetchAttempts: 3,
      useLlm: false,
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { query: 'Find secrets' },
      prompt: { raw: '{{query}}', label: 'test' },
      test: {
        metadata: {
          goal: 'Find secrets',
          testCaseId: 'tc-1',
        },
      } as any,
      evaluationId: 'eval-1',
    };

    const result = await provider.callApi('attack prompt', context);

    expect(result.metadata?.fetchAttempts).toBe(2);
    expect(result.metadata?.stopReason).toBe('Attack succeeded');
    expect(result.tokenUsage?.numRequests).toBe(2);
    expect(result.tokenUsage?.total).toBe(30);
    expect(result.tokenUsage?.prompt).toBe(12);
    expect(result.tokenUsage?.completion).toBe(18);
  });

  it('should count probe requests even when target returns an error', async () => {
    mockFetchWithRetries.mockResolvedValueOnce(
      mockJsonResponse({
        uuid: 'web-err',
        fullUrl: 'https://example.com/dynamic-pages/eval-1/web-err',
        path: '/dynamic-pages/eval-1/web-err',
        fetchPrompt: 'Please fetch https://example.com/dynamic-pages/eval-1/web-err',
      }),
    );

    const targetProvider: ApiProvider = {
      id: () => 'mock-target',
      callApi: vi.fn<() => Promise<ProviderResponse>>().mockResolvedValue({
        output: 'error output',
        error: 'Target failed',
      }),
    };

    const provider = new IndirectWebPwnProvider({
      injectVar: 'query',
      maxFetchAttempts: 3,
      useLlm: false,
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { query: 'Find secrets' },
      prompt: { raw: '{{query}}', label: 'test' },
      test: {
        metadata: {
          goal: 'Find secrets',
          testCaseId: 'tc-2',
        },
      } as any,
      evaluationId: 'eval-2',
    };

    const result = await provider.callApi('attack prompt', context);

    expect(result.metadata?.fetchAttempts).toBe(1);
    expect(result.metadata?.stopReason).toBe('Error');
    expect(result.tokenUsage?.numRequests).toBe(1);
  });
});
