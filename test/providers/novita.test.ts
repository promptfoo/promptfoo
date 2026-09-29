import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  createNovitaProvider,
  NovitaChatCompletionProvider,
  NovitaCompletionProvider,
  NovitaEmbeddingProvider,
} from '../../src/providers/novita';
import { HttpRateLimitError } from '../../src/util/fetch/errors';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));

const chatSuccessResponse = {
  data: {
    choices: [{ message: { content: 'Novita output' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
  },
  cached: false,
  status: 200,
  statusText: 'OK',
};

describe('Novita providers', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.mocked(fetchWithCache).mockReset();
    restoreEnv = mockProcessEnv({
      NOVITA_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_ORGANIZATION: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_TEMPERATURE: undefined,
      CUSTOM_NOVITA_KEY: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  describe('createNovitaProvider', () => {
    it('creates namespaced providers for explicit provider types and chat shorthand', () => {
      const chat = createNovitaProvider('novita:chat:model-name');
      const completion = createNovitaProvider('novita:completion:model-name');
      const embedding = createNovitaProvider('novita:embedding:model-name');
      const shorthand = createNovitaProvider('novita:model-name');

      expect(chat).toBeInstanceOf(NovitaChatCompletionProvider);
      expect(chat.id()).toBe('novita:chat:model-name');
      expect(completion).toBeInstanceOf(NovitaCompletionProvider);
      expect(completion.id()).toBe('novita:completion:model-name');
      expect(embedding).toBeInstanceOf(NovitaEmbeddingProvider);
      expect(embedding.id()).toBe('novita:embedding:model-name');
      expect(shorthand).toBeInstanceOf(NovitaChatCompletionProvider);
      expect(shorthand.id()).toBe('novita:chat:model-name');
    });

    it('rejects provider identifiers that do not include a model', () => {
      expect(() => createNovitaProvider('novita:chat:')).toThrow('Novita model name is required');
      expect(() => createNovitaProvider('novita:')).toThrow('Novita model name is required');
    });

    it('rejects unknown sub-types like `novita:image:foo` instead of silently routing to chat', () => {
      expect(() => createNovitaProvider('novita:image:foo')).toThrow(
        /Unknown Novita provider sub-type "image"/,
      );
      expect(() => createNovitaProvider('novita:moderation:bar')).toThrow(
        /Unknown Novita provider sub-type "moderation"/,
      );
      expect(() => createNovitaProvider('novita:embeddin:typo')).toThrow(
        /Unknown Novita provider sub-type "embeddin"/,
      );
    });

    it('treats `novita:embeddings:model` plural as embedding (documented alias)', () => {
      const provider = createNovitaProvider('novita:embeddings:embed-model');
      expect(provider).toBeInstanceOf(NovitaEmbeddingProvider);
    });

    it('preserves explicit endpoint, key environment, provider id, and sampling settings', () => {
      mockProcessEnv({ CUSTOM_NOVITA_KEY: 'proxy-key' });
      const provider = createNovitaProvider('novita:chat:model-name', {
        config: {
          id: 'configured-id',
          config: {
            apiBaseUrl: 'http://localhost:15501/openai/v1',
            apiKeyEnvar: 'CUSTOM_NOVITA_KEY',
            temperature: 0.4,
          },
        },
      }) as NovitaChatCompletionProvider;

      expect(provider.id()).toBe('configured-id');
      expect(provider.config.apiBaseUrl).toBe('http://localhost:15501/openai/v1');
      expect(provider.config.temperature).toBe(0.4);
      expect(provider.getApiKey()).toBe('proxy-key');
    });
  });

  describe('configuration and credential boundaries', () => {
    it('uses documented defaults for API URL, key variable, and text temperature', () => {
      const chat = new NovitaChatCompletionProvider('deepseek/deepseek-v3.2');
      const completion = new NovitaCompletionProvider('deepseek/deepseek-v3.2');
      const embedding = new NovitaEmbeddingProvider('embedding-model');

      expect(chat.getApiUrl()).toBe('https://api.novita.ai/openai/v1');
      expect(chat.config.apiKeyEnvar).toBe('NOVITA_API_KEY');
      expect(chat.config.temperature).toBe(1);
      expect(completion.config.temperature).toBe(1);
      expect(embedding.config.temperature).toBeUndefined();
    });

    it('does not inherit credentials, organizations, or routing from OpenAI environment', () => {
      mockProcessEnv({
        OPENAI_API_KEY: 'sk-openai-secret',
        OPENAI_ORGANIZATION: 'org-secret',
        OPENAI_API_HOST: 'wrong.example.test',
        OPENAI_API_BASE_URL: 'http://wrong.example.test/v1',
        OPENAI_BASE_URL: 'http://also-wrong.example.test/v1',
      });

      const providers = [
        new NovitaChatCompletionProvider('chat-model'),
        new NovitaCompletionProvider('completion-model'),
        new NovitaEmbeddingProvider('embedding-model'),
      ];

      for (const provider of providers) {
        expect(provider.getApiKey()).toBeUndefined();
        expect(provider.getOrganization()).toBeUndefined();
        expect(provider.getApiUrl()).toBe('https://api.novita.ai/openai/v1');
      }
    });

    it('fails before a chat request when a Novita key is unavailable', async () => {
      const provider = new NovitaChatCompletionProvider('chat-model');

      await expect(provider.callApi('hello')).rejects.toThrow('Novita API key is not set');
      expect(fetchWithCache).not.toHaveBeenCalled();
    });
  });

  describe('chat calls', () => {
    it('sends an authenticated request to the Novita endpoint and returns token usage', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue(chatSuccessResponse as any);
      const provider = new NovitaChatCompletionProvider('deepseek/deepseek-v3.2', {
        config: { apiKey: 'novita-key', max_tokens: 64 },
      });

      const result = await provider.callApi('Hello Novita');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.novita.ai/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer novita-key',
          },
        }),
        expect.any(Number),
        'json',
        undefined,
        undefined,
      );
      const request = vi.mocked(fetchWithCache).mock.calls[0][1] as RequestInit;
      expect(JSON.parse(request.body as string)).toMatchObject({
        model: 'deepseek/deepseek-v3.2',
        max_tokens: 64,
        temperature: 1,
      });
      expect(result.output).toBe('Novita output');
      expect(result.tokenUsage).toMatchObject({ total: 7, prompt: 4, completion: 3 });
    });

    it('returns HTTP errors from Novita', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: { error: { message: 'invalid key' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      } as any);
      const provider = new NovitaChatCompletionProvider('chat-model', {
        config: { apiKey: 'bad-key' },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('API error: 401 Unauthorized');
    });

    it('preserves structured rate-limit failures', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(
        new HttpRateLimitError({ status: 429, code: 'rate_limit_exceeded' }),
      );
      const provider = new NovitaChatCompletionProvider('chat-model', {
        config: { apiKey: 'novita-key' },
      });

      const result = await provider.callApi('hello');

      expect(result.error).toContain('Rate limit exceeded: HTTP 429 Too Many Requests');
    });
  });

  describe('completion and embedding calls', () => {
    it('sends completions with Novita defaults and reports output', async () => {
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          choices: [{ text: 'Completion output' }],
          usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);
      const provider = new NovitaCompletionProvider('completion-model', {
        config: { apiKey: 'novita-key' },
      });

      const result = await provider.callApi('complete this');

      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://api.novita.ai/openai/v1/completions');
      expect((request as RequestInit).headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer novita-key' }),
      );
      expect(JSON.parse((request as RequestInit).body as string).temperature).toBe(1);
      expect(result.output).toBe('Completion output');
    });

    it('sends embeddings without leaking OpenAI configuration and returns vectors', async () => {
      mockProcessEnv({ OPENAI_ORGANIZATION: 'org-secret' });
      vi.mocked(fetchWithCache).mockResolvedValue({
        data: {
          data: [{ embedding: [0.1, 0.2] }],
          usage: { prompt_tokens: 2, total_tokens: 2 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);
      const provider = new NovitaEmbeddingProvider('embedding-model', {
        config: { apiKey: 'novita-key' },
      });

      const result = await provider.callEmbeddingApi('embed this');

      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('https://api.novita.ai/openai/v1/embeddings');
      expect((request as RequestInit).headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer novita-key',
      });
      expect(result.embedding).toEqual([0.1, 0.2]);
    });
  });
});
