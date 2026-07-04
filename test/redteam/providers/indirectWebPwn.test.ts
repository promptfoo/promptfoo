import { beforeEach, describe, expect, it, vi } from 'vitest';
import IndirectWebPwnProvider from '../../../src/redteam/providers/indirectWebPwn';
import {
  addIndirectWebPwnTestCases,
  clearPageState,
} from '../../../src/redteam/strategies/indirectWebPwn';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

import type { CallApiContextParams } from '../../../src/types/index';

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
    clearPageState();
  });

  it('reports a fixed degraded outcome when per-turn page creation fails', async () => {
    mockFetchWithRetries.mockRejectedValueOnce(new Error('private create failure'));

    const [result] = await addIndirectWebPwnTestCases(
      [
        {
          vars: { query: 'private attack content' },
          assert: [],
          metadata: {
            pluginId: 'runtime-transform',
            evaluationId: 'eval-create',
            testCaseId: 'case-create',
          },
        },
      ],
      'query',
      { useLlm: false },
    );

    expect(result.vars?.query).toBe('private attack content');
    expect(result.metadata?.runtimeTransformDiagnostics).toEqual([
      { component: 'indirect-web-pwn', stage: 'create-page', outcome: 'degraded' },
    ]);
  });

  it('reports a fixed degraded outcome when a per-turn page update reuses stale state', async () => {
    mockFetchWithRetries
      .mockResolvedValueOnce(
        mockJsonResponse({
          uuid: 'web-stale',
          fullUrl: 'https://example.com/dynamic-pages/eval-update/web-stale',
          path: '/dynamic-pages/eval-update/web-stale',
          fetchPrompt: 'Please fetch the existing page',
        }),
      )
      .mockRejectedValueOnce(new Error('private update failure'));

    const testCase = {
      vars: { query: 'private attack content' },
      assert: [],
      metadata: {
        pluginId: 'runtime-transform',
        evaluationId: 'eval-update',
        testCaseId: 'case-update',
      },
    };
    await addIndirectWebPwnTestCases([testCase], 'query', { useLlm: false });
    const [result] = await addIndirectWebPwnTestCases([testCase], 'query', { useLlm: false });

    expect(result.vars?.query).toBe('Please fetch the existing page');
    expect(result.metadata?.runtimeTransformDiagnostics).toEqual([
      { component: 'indirect-web-pwn', stage: 'update-page', outcome: 'degraded' },
    ]);
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

    const targetProvider = createMockProvider({ id: 'mock-target' });
    targetProvider.callApi
      .mockReset()
      .mockResolvedValueOnce(
        createProviderResponse({
          output: 'Attempt 1 output',
          tokenUsage: { total: 10, prompt: 4, completion: 6 },
        }),
      )
      .mockResolvedValueOnce(
        createProviderResponse({
          output: 'Attempt 2 output',
          tokenUsage: { total: 20, prompt: 8, completion: 12 },
        }),
      );

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

    const targetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'error output',
        error: 'Target failed',
      }),
    });

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
