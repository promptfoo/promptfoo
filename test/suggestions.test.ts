import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultProviders } from '../src/providers/defaults';
import { generatePrompts } from '../src/suggestions';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider, DefaultProviders } from '../src/types/index';

vi.mock('../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

describe('generatePrompts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('uses the resolved default suggestions provider', async () => {
    const callApi = vi.fn().mockResolvedValue({
      output: 'Variant prompt',
      tokenUsage: {
        completion: 1,
        prompt: 2,
        total: 3,
      },
    });
    const provider: ApiProvider = {
      id: () => 'openai:codex-sdk',
      callApi,
    };
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } satisfies DefaultProviders);

    const result = await generatePrompts('Original prompt', 1);

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      prompts: ['Variant prompt'],
      tokensUsed: {
        ...createEmptyTokenUsage(),
        completion: 1,
        prompt: 2,
        total: 3,
      },
    });
  });
});
