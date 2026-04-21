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
    mocks.configuredProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({ output: 'should not be used' }),
    ) as ApiProvider['callApi'];
    mocks.webSearchProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({
        output: JSON.stringify({ pass: true, score: 1, reason: 'web search ok' }),
        tokenUsage: { total: 5, prompt: 3, completion: 2 },
      }),
    ) as ApiProvider['callApi'];
    mocks.loadApiProvider.mockResolvedValue(mocks.configuredProvider);
    mocks.getDefaultProviders.mockResolvedValue({
      webSearchProvider: mocks.webSearchProvider,
      llmRubricProvider: null,
      gradingProvider: null,
    });
  });

  it('resolves string grading providers before checking web search capability', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');

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

  it('throws when grading config is missing', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');

    await expect(matchesSearchRubric('Confirm current facts', 'output')).rejects.toThrow(
      'Cannot grade output without grading config',
    );
  });

  it('uses configured providers that already support web search', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');
    mocks.loadApiProvider.mockResolvedValue(mocks.webSearchProvider);

    const result = await matchesSearchRubric('Confirm current facts', 'output', {
      provider: 'openai:responses:gpt-5.4-2026-03-05',
    });

    expect(mocks.webSearchProvider.callApi).toHaveBeenCalledTimes(1);
    expect(result.metadata).toEqual({
      searchProvider: 'openai:gpt-5.4-2026-03-05',
      searchResults: [],
    });
  });

  it('applies assertion thresholds to parsed search results', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');
    mocks.webSearchProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({
        output: JSON.stringify({ pass: true, score: 0.4, reason: 'too weak' }),
      }),
    ) as ApiProvider['callApi'];

    await expect(
      matchesSearchRubric(
        'Confirm current facts',
        'output',
        {},
        {},
        { type: 'search-rubric', value: 'Confirm current facts', threshold: 0.5 },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0.4,
        reason: 'too weak',
      }),
    );
  });

  it('returns a failure when the search provider returns no output', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');
    mocks.webSearchProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({
        error: 'search unavailable',
      }),
    ) as ApiProvider['callApi'];

    await expect(matchesSearchRubric('Confirm current facts', 'output', {})).resolves.toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'Search rubric evaluation failed: search unavailable',
      }),
    );
  });

  it('falls back to simple pass parsing when JSON extraction fails', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');
    mocks.webSearchProvider.callApi = vi.fn(
      async (): Promise<ProviderResponse> => ({
        output: 'verdict includes "pass": true',
      }),
    ) as ApiProvider['callApi'];

    await expect(matchesSearchRubric('Confirm current facts', 'output', {})).resolves.toEqual(
      expect.objectContaining({
        pass: true,
        score: 1,
        reason: 'verdict includes "pass": true',
      }),
    );
  });

  it('throws when no web search provider can be resolved', async () => {
    const { matchesSearchRubric } = await import('../../src/matchers/search');
    mocks.getDefaultProviders.mockResolvedValue({
      webSearchProvider: null,
      llmRubricProvider: null,
      gradingProvider: mocks.configuredProvider,
    });
    mocks.loadApiProvider.mockResolvedValue(null);

    await expect(matchesSearchRubric('Confirm current facts', 'output', {})).rejects.toThrow(
      'anthropic:messages:claude-sonnet-4-6',
    );
  });
});
