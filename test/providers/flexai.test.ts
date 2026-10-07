import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  createFlexAiProvider,
  DEFAULT_FLEXAI_CHAT_MODEL,
  DEFAULT_FLEXAI_EMBEDDING_MODEL,
  FLEXAI_API_BASE_URL,
  FlexAiChatCompletionProvider,
  FlexAiEmbeddingProvider,
} from '../../src/providers/flexai';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The providers extend the OpenAI-compatible base classes; the FlexAI-specific
// wiring (routing, base URL, key resolution, request body) is what we assert
// here. The underlying HTTP behaviour is covered by the OpenAI provider tests.
function asChat(provider: unknown) {
  return provider as FlexAiChatCompletionProvider & {
    getOpenAiBody: (prompt: string, context?: any) => Promise<{ body: any; config: any }>;
  };
}

afterEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});

describe('createFlexAiProvider routing', () => {
  it('parses flexai:<model> as chat', () => {
    const provider = createFlexAiProvider('flexai:gpt-oss-120b');
    expect(provider).toBeInstanceOf(FlexAiChatCompletionProvider);
    expect(provider.id()).toBe('flexai:gpt-oss-120b');
  });

  it('parses flexai:chat:<model> to the same model', () => {
    const provider = createFlexAiProvider('flexai:chat:gpt-oss-120b');
    expect(provider).toBeInstanceOf(FlexAiChatCompletionProvider);
    expect(provider.id()).toBe('flexai:gpt-oss-120b');
  });

  it('preserves dotted model ids', () => {
    expect(asChat(createFlexAiProvider('flexai:Qwen3.6-27B-FP8')).modelName).toBe(
      'Qwen3.6-27B-FP8',
    );
  });

  it('falls back to the default chat model for a bare prefix', () => {
    for (const path of ['flexai:', 'flexai:chat', 'flexai:chat:']) {
      expect(asChat(createFlexAiProvider(path)).modelName).toBe(DEFAULT_FLEXAI_CHAT_MODEL);
    }
  });

  it('routes embedding and embeddings to the embedding provider', () => {
    for (const path of ['flexai:embedding:bge-m3', 'flexai:embeddings:bge-m3']) {
      const provider = createFlexAiProvider(path);
      expect(provider).toBeInstanceOf(FlexAiEmbeddingProvider);
      expect(provider.id()).toBe('flexai:embedding:bge-m3');
    }
  });

  it('falls back to the default embedding model', () => {
    const provider = createFlexAiProvider('flexai:embedding');
    expect(provider.id()).toBe(`flexai:embedding:${DEFAULT_FLEXAI_EMBEDDING_MODEL}`);
  });

  it.each(['completion', 'image', 'audio', 'transcription', 'moderation', 'responses', 'realtime'])(
    'fails fast for the unsupported flexai:%s subtype',
    (subtype) => {
      expect(() => createFlexAiProvider(`flexai:${subtype}:some-model`)).toThrow(
        `flexai:${subtype} is not supported`,
      );
    },
  );
});

describe('FlexAI provider configuration', () => {
  it('points chat and embeddings at the FlexAI base URL and key envar', () => {
    for (const path of ['flexai:gpt-oss-120b', 'flexai:embedding:bge-m3']) {
      const provider = createFlexAiProvider(path) as FlexAiChatCompletionProvider;
      expect(provider.config.apiBaseUrl).toBe(FLEXAI_API_BASE_URL);
      expect(provider.config.apiKeyEnvar).toBe('FLEXAI_API_KEY');
      expect(provider.getApiUrl()).toBe('https://api.flex.ai/v1');
    }
  });

  it('lets the user override the base URL', () => {
    const provider = createFlexAiProvider('flexai:gpt-oss-120b', {
      config: { apiBaseUrl: 'https://proxy.example.com/v1' },
    }) as FlexAiChatCompletionProvider;
    expect(provider.getApiUrl()).toBe('https://proxy.example.com/v1');
  });

  it('ignores OPENAI_BASE_URL and OPENAI_API_HOST', () => {
    const restore = mockProcessEnv({
      OPENAI_BASE_URL: 'https://openai-proxy.example.com/v1',
      OPENAI_API_BASE_URL: 'https://openai-proxy.example.com/v1',
      OPENAI_API_HOST: 'openai-host.example.com',
    });
    try {
      const provider = createFlexAiProvider('flexai:gpt-oss-120b') as FlexAiChatCompletionProvider;
      expect(provider.getApiUrl()).toBe(FLEXAI_API_BASE_URL);
    } finally {
      restore();
    }
  });

  it('passes through standard OpenAI options', () => {
    const provider = createFlexAiProvider('flexai:gpt-oss-120b', {
      config: { temperature: 0.2, max_tokens: 256 },
    }) as FlexAiChatCompletionProvider;
    expect(provider.config.temperature).toBe(0.2);
    expect(provider.config.max_tokens).toBe(256);
  });

  it('reports itself as a FlexAI provider and redacts an explicit apiKey', () => {
    const chat = createFlexAiProvider('flexai:gpt-oss-120b', {
      config: { apiKey: 'sk-secret', temperature: 0.2 },
    }) as FlexAiChatCompletionProvider;
    expect(chat.toString()).toBe('[FlexAI Provider gpt-oss-120b]');
    const json = chat.toJSON();
    expect(json).toMatchObject({ provider: 'flexai', model: 'gpt-oss-120b' });
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toContain('sk-secret');

    const embedding = createFlexAiProvider('flexai:embedding:bge-m3', {
      config: { apiKey: 'sk-secret' },
    }) as FlexAiEmbeddingProvider;
    expect(embedding.toString()).toBe('[FlexAI Embedding Provider bge-m3]');
    expect(JSON.stringify(embedding.toJSON())).not.toContain('sk-secret');
  });
});

describe('FlexAI key resolution', () => {
  it('resolves apiKey from config', () => {
    const provider = createFlexAiProvider('flexai:gpt-oss-120b', {
      config: { apiKey: 'sk-from-config' },
    }) as FlexAiChatCompletionProvider;
    expect(provider.getApiKey()).toBe('sk-from-config');
  });

  it('resolves apiKey from the FLEXAI_API_KEY env var', () => {
    const restore = mockProcessEnv({ FLEXAI_API_KEY: 'sk-from-env' });
    try {
      for (const path of ['flexai:gpt-oss-120b', 'flexai:embedding:bge-m3']) {
        const provider = createFlexAiProvider(path) as FlexAiChatCompletionProvider;
        expect(provider.getApiKey()).toBe('sk-from-env');
      }
    } finally {
      restore();
    }
  });

  it('does not fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
    const restore = mockProcessEnv({
      FLEXAI_API_KEY: undefined,
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
    });
    try {
      for (const path of ['flexai:gpt-oss-120b', 'flexai:embedding:bge-m3']) {
        const provider = createFlexAiProvider(path) as FlexAiChatCompletionProvider;
        expect(provider.getApiKey()).toBeUndefined();
        expect(provider.getOrganization()).toBeUndefined();
      }
    } finally {
      restore();
    }
  });

  it('honours a custom apiKeyEnvar', () => {
    const restore = mockProcessEnv({ CUSTOM_FLEXAI_KEY: 'sk-custom' });
    try {
      const provider = createFlexAiProvider('flexai:gpt-oss-120b', {
        config: { apiKeyEnvar: 'CUSTOM_FLEXAI_KEY' },
      }) as FlexAiChatCompletionProvider;
      expect(provider.getApiKey()).toBe('sk-custom');
    } finally {
      restore();
    }
  });

  it('throws a missing-key error naming FLEXAI_API_KEY without calling the API', async () => {
    const restore = mockProcessEnv({ FLEXAI_API_KEY: undefined, OPENAI_API_KEY: 'sk-openai' });
    try {
      await expect(createFlexAiProvider('flexai:gpt-oss-120b').callApi('Hello')).rejects.toThrow(
        'FLEXAI_API_KEY',
      );
      expect(fetchWithCache).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe('FlexAI chat request body', () => {
  it('omits the injected max_tokens default so reasoning has room', async () => {
    const restore = mockProcessEnv({ OPENAI_MAX_TOKENS: undefined });
    try {
      const { body } = await asChat(createFlexAiProvider('flexai:gpt-oss-120b')).getOpenAiBody(
        'Hello',
      );
      expect(body.max_tokens).toBeUndefined();
      expect(body.model).toBe('gpt-oss-120b');
    } finally {
      restore();
    }
  });

  it('keeps an explicit max_tokens from provider config', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:gpt-oss-120b', { config: { max_tokens: 512 } }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_tokens).toBe(512);
  });

  it('prefers a prompt-level max_tokens over the provider config', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:gpt-oss-120b', { config: { max_tokens: 512 } }),
    );
    const { body } = await provider.getOpenAiBody('Hello', {
      prompt: { raw: 'Hello', label: 'test', config: { max_tokens: 64 } },
      vars: {},
    });
    expect(body.max_tokens).toBe(64);
  });

  it('keeps a max_tokens sent through passthrough', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:gpt-oss-120b', { config: { passthrough: { max_tokens: 99 } } }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_tokens).toBe(99);
  });

  it('keeps OPENAI_MAX_TOKENS when it is set', async () => {
    const restore = mockProcessEnv({ OPENAI_MAX_TOKENS: '300' });
    try {
      const { body } = await asChat(createFlexAiProvider('flexai:gpt-oss-120b')).getOpenAiBody(
        'Hello',
      );
      expect(body.max_tokens).toBe(300);
    } finally {
      restore();
    }
  });

  it('keeps the deterministic temperature default', async () => {
    const { body } = await asChat(createFlexAiProvider('flexai:gpt-oss-120b')).getOpenAiBody(
      'Hello',
    );
    expect(body.temperature).toBe(0);
  });

  it('forwards reasoning_effort for models the OpenAI base class does not recognize', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
        config: { reasoning_effort: 'high' },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBe('high');
  });

  it('renders vars in reasoning_effort before forwarding', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
        config: { reasoning_effort: '{{ effort }}' as any },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello', {
      prompt: { raw: 'Hello', label: 'test' },
      vars: { effort: 'low' },
    });
    expect(body.reasoning_effort).toBe('low');
  });

  it('does not inject reasoning_effort when unset', async () => {
    const { body } = await asChat(
      createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731'),
    ).getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('keeps a reasoning_effort sent through passthrough', async () => {
    const provider = asChat(
      createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
        config: { passthrough: { reasoning_effort: 'max' } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBe('max');
  });
});

describe('FlexAI callApi', () => {
  it('sends the request to FlexAI and returns the answer, reasoning, and usage', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { role: 'assistant', content: '391', reasoning_content: '17*23=391' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 17,
          completion_tokens: 16,
          total_tokens: 33,
          completion_tokens_details: { reasoning_tokens: 13 },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const provider = createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
      config: { apiKey: 'k', reasoning_effort: 'high' },
    });
    const result = await provider.callApi('What is 17*23?');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Thinking: 17*23=391\n\n391');
    expect(result.tokenUsage).toMatchObject({ prompt: 17, completion: 16, total: 33 });

    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.flex.ai/v1/chat/completions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('DeepSeek-V4-Flash-0731');
    expect(body.reasoning_effort).toBe('high');
  });

  it('drops reasoning from the output when showThinking is false', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: { role: 'assistant', content: '391', reasoning_content: 'thinking...' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const provider = createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
      config: { apiKey: 'k', showThinking: false },
    });
    const result = await provider.callApi('What is 17*23?');
    expect(result.output).toBe('391');
  });

  it('surfaces API errors', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { error: { message: "Unsupported parameter: 'n' must be 1" } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    } as any);

    const provider = createFlexAiProvider('flexai:gpt-oss-120b', {
      config: { apiKey: 'k', passthrough: { n: 2 } },
    });
    const result = await provider.callApi('Hello');
    expect(result.error).toContain('400');
  });

  it('computes cost from user-supplied rates', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const inputCost = 0.06 / 1_000_000;
    const outputCost = 0.18 / 1_000_000;
    const provider = createFlexAiProvider('flexai:DeepSeek-V4-Flash-0731', {
      config: { apiKey: 'k', inputCost, outputCost },
    });
    const result = await provider.callApi('Hello');
    expect(result.cost).toBeCloseTo(1000 * inputCost + 500 * outputCost, 12);
  });

  it('calls the FlexAI embeddings endpoint', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { prompt_tokens: 3, total_tokens: 3 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const provider = createFlexAiProvider('flexai:embedding:bge-m3', {
      config: { apiKey: 'k' },
    }) as FlexAiEmbeddingProvider;
    const result = await provider.callEmbeddingApi('hello');

    expect(result.error).toBeUndefined();
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
    const [url, init] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://api.flex.ai/v1/embeddings');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      input: 'hello',
      model: 'bge-m3',
    });
  });
});
