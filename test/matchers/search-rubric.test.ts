import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider, ProviderResponse } from '../../src/types/index';

const mocks = vi.hoisted(() => {
  const configuredProvider: ApiProvider = {
    id: () => 'openai:gpt-4o',
    config: {},
    callApi: vi.fn(async (): Promise<ProviderResponse> => ({ output: 'should not be used' })),
  };
  const webSearchProvider = {
    id: () => 'openai:gpt-5.4-2026-03-05',
    constructor: { name: 'OpenAiResponsesProvider' },
    config: {
      tools: [{ type: 'web_search_preview' }],
    },
    callApi: vi.fn(
      async (): Promise<ProviderResponse> => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'web search ok' }),
        tokenUsage: { total: 5, prompt: 3, completion: 2 },
      }),
    ),
  } as unknown as ApiProvider;

  return {
    configuredProvider,
    loadApiProvider: vi.fn(),
    getDefaultProviders: vi.fn(),
    webSearchProvider,
  };
});

vi.mock('../../src/providers/index', () => ({
  loadApiProvider: mocks.loadApiProvider,
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: mocks.getDefaultProviders,
}));

describe('matchesSearchRubric', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadApiProvider.mockResolvedValue(mocks.configuredProvider);
    mocks.getDefaultProviders.mockResolvedValue({
      webSearchProvider: mocks.webSearchProvider,
      llmRubricProvider: null,
      gradingProvider: null,
    });
  });

  it('resolves string grading providers before checking web search capability', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers');

    const result = await matchesSearchRubric('Confirm current facts', 'output', {
      provider: 'openai:responses:gpt-5.4-2026-03-05',
    });

    expect(mocks.loadApiProvider).toHaveBeenCalled();
    expect(mocks.loadApiProvider.mock.calls[0][0]).toBe('openai:responses:gpt-5.4-2026-03-05');
    expect(mocks.configuredProvider.callApi).not.toHaveBeenCalled();
    expect(mocks.webSearchProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 1,
        reason: 'web search ok',
      }),
    );
  });
});
