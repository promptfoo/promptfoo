import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { GroqProvider } from '../../../src/providers/groq/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

describe('Groq malformed passthrough model errors', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv();
    vi.mocked(fetchWithCache).mockReset();
  });

  afterEach(() => {
    restoreEnv();
    vi.resetAllMocks();
  });

  it.each([null, 123])(
    'returns the request error instead of rejecting during classification for model %s',
    async (model) => {
      const errorData = { error: { message: 'Fixture model must be a string' } };
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: errorData,
        cached: false,
        status: 400,
        statusText: 'Bad Request',
        headers: {},
      });
      const provider = new GroqProvider('llama-3.3-70b-versatile', {
        config: {
          apiKey: 'fixture-groq-key',
          apiBaseUrl: 'https://groq.invalid/openai/v1',
          max_tokens: 100,
          passthrough: { model },
        },
      });

      await expect(provider.callApi('Hello')).resolves.toMatchObject({
        error: `API error: 400 Bad Request\n${JSON.stringify(errorData)}`,
        metadata: { http: { status: 400, statusText: 'Bad Request', headers: {} } },
      });
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://groq.invalid/openai/v1/chat/completions');
      expect(JSON.parse(request?.body as string)).toMatchObject({ model, max_tokens: 100 });
    },
  );
});
