import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { loadApiProvider } from '../../../src/providers';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('compatible provider factory token limits', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv(createUnsetOpenAiGenerationEnv());
    vi.mocked(fetchWithCache).mockReset();
    vi.mocked(fetchWithCache).mockResolvedValue(
      createMockFetchResponse({
        choices: [{ message: { role: 'assistant', content: 'ready' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  afterEach(() => {
    restoreEnv();
  });

  it.each([
    'nscale:chat:internal-model',
    'nscale:internal-model',
    'litellm:internal-model',
    'aimlapi:chat:internal-model',
    'aimlapi:internal-model',
    'cometapi:chat:internal-model',
    'cometapi:internal-model',
    'envoy:internal-model',
    'f5:internal-model',
  ])('preserves max_tokens for %s independently of a custom provider label', async (id) => {
    const provider = await loadApiProvider(id, {
      options: {
        id: 'custom-label',
        config: {
          apiKey: 'fixture-key',
          apiBaseUrl: 'https://gateway.example.test/v1',
          max_tokens: 73,
        },
      },
    });
    const result = await provider.callApi('Hello');
    expect(result.output).toBe('ready');
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.max_tokens).toBe(73);
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('requestPolicy');
  });

  it('preserves compatible defaults for an opaque alias behind a custom endpoint', async () => {
    const provider = await loadApiProvider('openai:chat:internal-model', {
      options: {
        id: 'custom-label',
        config: {
          apiKey: 'fixture-key',
          apiBaseUrl: 'https://gateway.example.test/v1',
          max_tokens: 73,
        },
      },
    });
    await provider.callApi('Hello');
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
    expect(body.max_tokens).toBe(73);
    expect(body.temperature).toBe(0);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });
});
