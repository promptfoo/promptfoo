import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';

vi.mock('../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('CohereChatCompletionProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        text: 'cohere response',
        token_count: { total_tokens: 8, prompt_tokens: 5, response_tokens: 3 },
      },
      cached: false,
    } as any);
  });

  it('forwards bustCache from the call context to the fetch layer', async () => {
    const provider = new CohereChatCompletionProvider('command-r', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('test prompt', { bustCache: true } as any);

    expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBe(true);
  });

  it('forwards debug as cache bust', async () => {
    const provider = new CohereChatCompletionProvider('command-r', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('test prompt', { debug: true } as any);

    expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBe(true);
  });

  it('does not bust the cache without a signal', async () => {
    const provider = new CohereChatCompletionProvider('command-r', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('test prompt');

    expect(result.output).toBe('cohere response');
    expect(vi.mocked(fetchWithCache).mock.calls[0][4]).toBeFalsy();
  });
});
