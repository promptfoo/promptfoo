import { describe, expect, it, vi } from 'vitest';
import { clearCache, enableCache, fetchWithCache } from '../../src/cache';
import cliState from '../../src/cliState';
import { loadClaudeCodeCredential } from '../../src/providers/anthropic/claudeCodeAuth';
import { getAnthropicEnvHeaderSuppressions } from '../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import {
  calculateMetaCost,
  createMetaProvider,
  MetaMessagesProvider,
  MetaResponsesProvider,
} from '../../src/providers/meta';
import { filterProviders } from '../../src/util/eval/filterProviders';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// A valid, unexpired Claude Code OAuth credential is always "available" so the
// OAuth-suppression test below proves MetaMessagesProvider refuses it even
// when one exists (rather than passing trivially on machines without one).
vi.mock('../../src/providers/anthropic/claudeCodeAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/anthropic/claudeCodeAuth')>()),
  loadClaudeCodeCredential: vi.fn(() => ({
    accessToken: 'claude-code-oauth-secret',
    expiresAt: Date.now() + 60 * 60 * 1000,
  })),
}));

// The provider extends OpenAiChatCompletionProvider; the Meta-specific wiring
// (routing, base URL, key resolution, reasoning-model body shaping, cost) is
// what we assert here. The underlying HTTP behaviour is covered by the OpenAI
// provider's own tests.
function asChat(provider: ReturnType<typeof createMetaProvider>) {
  return provider as unknown as OpenAiChatCompletionProvider & {
    getApiUrl: () => string;
    getOrganization: () => unknown;
    getOpenAiBody: (prompt: string, context?: any) => Promise<{ body: any; config: any }>;
    toJSON: () => any;
  };
}

describe('createMetaProvider routing', () => {
  it('defaults meta:<model> to the Responses API provider', () => {
    const provider = createMetaProvider('meta:muse-spark-1.1');
    expect(provider).toBeInstanceOf(MetaResponsesProvider);
    expect(provider.id()).toBe('meta:responses:muse-spark-1.1');
    expect(asChat(provider).modelName).toBe('muse-spark-1.1');
  });

  it('routes meta:chat:<model> to the chat completions provider', () => {
    const provider = createMetaProvider('meta:chat:muse-spark-1.1');
    expect(provider).not.toBeInstanceOf(MetaResponsesProvider);
    expect(provider.id()).toBe('meta:chat:muse-spark-1.1');
    expect(asChat(provider).modelName).toBe('muse-spark-1.1');
    expect(filterProviders([provider], '^meta:chat:')).toEqual([provider]);
    expect(createMetaProvider(provider.id())).not.toBeInstanceOf(MetaResponsesProvider);
  });

  it('falls back to the default model for a bare prefix', () => {
    expect(asChat(createMetaProvider('meta:')).modelName).toBe('muse-spark-1.1');
    expect(createMetaProvider('meta:').id()).toBe('meta:responses:muse-spark-1.1');
    expect(asChat(createMetaProvider('meta:chat')).modelName).toBe('muse-spark-1.1');
    expect(asChat(createMetaProvider('meta:chat:')).modelName).toBe('muse-spark-1.1');
  });

  it('routes meta:responses:<model> to the Responses API provider', () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1');
    expect(provider).toBeInstanceOf(MetaResponsesProvider);
    expect(provider.id()).toBe('meta:responses:muse-spark-1.1');
    expect(createMetaProvider('meta:responses').id()).toBe('meta:responses:muse-spark-1.1');
  });

  it('routes meta:messages:<model> to the Anthropic-compatible Messages provider', () => {
    const provider = createMetaProvider('meta:messages:muse-spark-1.1');
    expect(provider).toBeInstanceOf(MetaMessagesProvider);
    expect(provider.id()).toBe('meta:messages:muse-spark-1.1');
    expect(createMetaProvider('meta:messages').id()).toBe('meta:messages:muse-spark-1.1');
  });

  it.each([
    'assistant',
    'audio',
    'completion',
    'embedding',
    'embeddings',
    'image',
    'moderation',
    'realtime',
    'transcription',
    'video',
  ])('fails fast for the unsupported %s sub-type instead of treating it as a model', (subType) => {
    expect(() => createMetaProvider(`meta:${subType}:foo`)).toThrow(/does not expose/);
  });

  it.each([
    'agents',
    'chatkit',
    'codex-sdk',
    'voice',
  ])('rejects the unknown %s sub-type instead of routing it as a Responses model', (subType) => {
    expect(() => createMetaProvider(`meta:${subType}:foo`)).toThrow(
      /Unknown Meta Model API sub-type/,
    );
  });

  it('still treats a bare single-segment path as a model id', () => {
    expect(createMetaProvider('meta:muse-spark-2').id()).toBe('meta:responses:muse-spark-2');
  });

  it.each([
    'meta:muse-spark-1.1',
    'meta:chat:muse-spark-1.1',
    'meta:messages:muse-spark-1.1',
  ])('attributes %s tracing spans to the meta system', (providerPath) => {
    const provider = createMetaProvider(providerPath);
    expect((provider as unknown as { getGenAISystem: () => string }).getGenAISystem()).toBe('meta');
  });
});

describe('MetaProvider configuration', () => {
  it('points at the Meta base URL and key envar by default', () => {
    const provider = asChat(createMetaProvider('meta:chat:muse-spark-1.1'));
    expect(provider.config.apiBaseUrl).toBe('https://api.meta.ai/v1');
    expect(provider.config.apiKeyEnvar).toBe('MODEL_API_KEY');
    expect(provider.getApiUrl()).toBe('https://api.meta.ai/v1');
  });

  it('lets the user override the base URL', () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { apiBaseUrl: 'https://proxy.example.com/v1' },
      }),
    );
    expect(provider.getApiUrl()).toBe('https://proxy.example.com/v1');
  });

  it.each([
    'meta:chat:muse-spark-1.1',
    'meta:responses:muse-spark-1.1',
  ])('honours apiHost and normalizes trailing slashes for %s', (id) => {
    const trailingSlashes = '/'.repeat(100_000);
    const withHost = createMetaProvider(id, {
      config: { apiHost: `proxy.example.com${trailingSlashes}` },
    }) as MetaResponsesProvider;
    const withBaseUrl = createMetaProvider(id, {
      config: { apiBaseUrl: `https://proxy.example.com/v1${trailingSlashes}` },
    }) as MetaResponsesProvider;
    expect((withHost as any).getApiUrl()).toBe('https://proxy.example.com/v1');
    expect((withBaseUrl as any).getApiUrl()).toBe('https://proxy.example.com/v1');
  });

  it('resolves an empty-string apiBaseUrl (e.g. an unset template) to the Meta host', () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { apiBaseUrl: '' },
      }),
    );
    expect(provider.getApiUrl()).toBe('https://api.meta.ai/v1');
  });

  it('passes through standard OpenAI options without dropping them', () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { temperature: 0.2, max_completion_tokens: 256 },
      }),
    );
    expect(provider.config.temperature).toBe(0.2);
    expect(provider.config.max_completion_tokens).toBe(256);
  });

  it('reports itself as a Meta provider', () => {
    const provider = createMetaProvider('meta:chat:muse-spark-1.1');
    expect(provider.toString()).toBe('[Meta Model API Provider muse-spark-1.1]');
    expect(asChat(provider).toJSON()).toMatchObject({
      provider: 'meta:chat',
      model: 'muse-spark-1.1',
    });
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { apiKey: 'LLM|123|secret', temperature: 0.2 },
      }),
    );
    const json = provider.toJSON();
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toContain('LLM|123|secret');
  });
});

describe('MetaProvider key resolution', () => {
  it('resolves apiKey from config', () => {
    const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|from-config' },
    });
    expect((provider as any).getApiKey()).toBe('LLM|1|from-config');
  });

  it("resolves apiKey from Meta's official MODEL_API_KEY env var", () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: 'LLM|1|official' });
    try {
      const provider = createMetaProvider('meta:chat:muse-spark-1.1');
      expect((provider as any).getApiKey()).toBe('LLM|1|official');
    } finally {
      restore();
    }
  });

  it('falls back to MODEL_API_KEY when an apiKey template resolves to an empty string', () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: 'LLM|1|official' });
    try {
      const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { apiKey: '' },
      });
      expect((provider as any).getApiKey()).toBe('LLM|1|official');
    } finally {
      restore();
    }
  });

  it('does NOT fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
    const restore = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
      MODEL_API_KEY: undefined,
    });
    try {
      const provider = asChat(createMetaProvider('meta:chat:muse-spark-1.1'));
      expect((provider as any).getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('prefers a provider-scoped env override over the ambient process env', () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: 'LLM|1|ambient' });
    try {
      const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
        env: { MODEL_API_KEY: 'LLM|1|pinned' },
      });
      expect((provider as any).getApiKey()).toBe('LLM|1|pinned');
    } finally {
      restore();
    }
  });

  it('honours a custom apiKeyEnvar (and skips the MODEL_API_KEY fallback)', () => {
    const restore = mockProcessEnv({
      CUSTOM_META_KEY: 'LLM|1|custom',
      MODEL_API_KEY: 'LLM|1|generic',
    });
    try {
      const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { apiKeyEnvar: 'CUSTOM_META_KEY' },
      });
      expect((provider as any).getApiKey()).toBe('LLM|1|custom');
    } finally {
      restore();
    }
  });
});

describe('MetaProvider request body shaping', () => {
  it('treats Muse models as reasoning models: no injected max_tokens default', async () => {
    const provider = asChat(createMetaProvider('meta:chat:muse-spark-1.1'));
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('keeps the deterministic temperature default (Muse accepts temperature)', async () => {
    const provider = asChat(createMetaProvider('meta:chat:muse-spark-1.1'));
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.temperature).toBe(0);
  });

  it('forwards reasoning_effort, including the Meta-specific xhigh level', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { reasoning_effort: 'xhigh' },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBe('xhigh');
  });

  it('renders templated reasoning_effort before validating it', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { reasoning_effort: '{{effort}}' as any },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello', { vars: { effort: 'high' } });
    expect(body.reasoning_effort).toBe('high');
  });

  it('forwards max_completion_tokens', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { max_completion_tokens: 4096 },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.max_tokens).toBeUndefined();
  });

  it('maps an explicit max_tokens onto max_completion_tokens instead of dropping it', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { max_tokens: 2048 },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
  });

  it('maps passthrough max_tokens onto max_completion_tokens instead of dropping it', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { max_completion_tokens: 4096, passthrough: { max_tokens: 2048 } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
  });

  it('does not leak OPENAI_* sampling/cap env defaults into Meta requests', async () => {
    const restore = mockProcessEnv({
      OPENAI_TEMPERATURE: '0.9',
      OPENAI_TOP_P: '0.5',
      OPENAI_PRESENCE_PENALTY: '0.7',
      OPENAI_FREQUENCY_PENALTY: '0.9',
      OPENAI_MAX_COMPLETION_TOKENS: '256',
    });
    try {
      const provider = asChat(createMetaProvider('meta:chat:muse-spark-1.1'));
      const { body } = await provider.getOpenAiBody('Hello');
      expect(body.temperature).toBe(0); // promptfoo's config default, not the env value
      expect(body.top_p).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
      expect(body.max_completion_tokens).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("rejects reasoning_effort 'none' with a clear error instead of an HTTP 400", async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { reasoning_effort: 'none' },
      }),
    );
    await expect(provider.getOpenAiBody('Hello')).rejects.toThrow(/reasoning_effort 'none'/);
  });

  it('rejects `stop` with a clear error instead of an HTTP 400 per request', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { stop: ['\n'] },
      }),
    );
    await expect(provider.getOpenAiBody('Hello')).rejects.toThrow(/stop/);
  });

  it.each([
    [{ logprobs: true }, /logprobs/],
    [{ logit_bias: { '50256': -100 } }, /logit_bias/],
    [{ n: 2 }, /n > 1/],
    [{ stream: true }, /streaming is not supported/],
  ])('rejects unsupported chat passthrough options: %j', async (passthrough, error) => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { passthrough },
      }),
    );
    await expect(provider.getOpenAiBody('Hello')).rejects.toThrow(error);
  });

  it('rejects top-level `stream` config instead of silently running non-streaming', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { stream: true },
      }),
    );
    await expect(provider.getOpenAiBody('Hello')).rejects.toThrow(/streaming is not supported/);
  });

  it('rejects top-level `logit_bias` config with a clear error', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { logit_bias: { '50256': -100 } } as Record<string, unknown>,
      }),
    );
    await expect(provider.getOpenAiBody('Hello')).rejects.toThrow(/logit_bias/);
  });

  it('leaves explicit passthrough values untouched', async () => {
    const provider = asChat(
      createMetaProvider('meta:chat:muse-spark-1.1', {
        config: { passthrough: { max_completion_tokens: 5000, top_p: 0.9, temperature: 1.5 } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.max_completion_tokens).toBe(5000);
    expect(body.top_p).toBe(0.9);
    expect(body.temperature).toBe(1.5);
  });
});

describe('calculateMetaCost', () => {
  it('uses the built-in muse-spark-1.1 price table', () => {
    // 1000 input at $1.25/M + 500 output at $4.25/M
    expect(calculateMetaCost('muse-spark-1.1', {}, 1000, 500)).toBeCloseTo(
      (1000 * 1.25 + 500 * 4.25) / 1e6,
      12,
    );
  });

  it('bills cached prompt tokens at the cached-input rate', () => {
    // 600 uncached at $1.25/M, 400 cached at $0.15/M, 500 output at $4.25/M
    expect(calculateMetaCost('muse-spark-1.1', {}, 1000, 500, 400)).toBeCloseTo(
      (600 * 1.25 + 400 * 0.15 + 500 * 4.25) / 1e6,
      12,
    );
  });

  it('returns undefined for unknown models without user pricing', () => {
    expect(calculateMetaCost('muse-unknown', {}, 1000, 500)).toBeUndefined();
  });

  it('returns undefined when token counts are missing', () => {
    expect(calculateMetaCost('muse-spark-1.1', {}, undefined, 500)).toBeUndefined();
    expect(calculateMetaCost('muse-spark-1.1', {}, 1000, undefined)).toBeUndefined();
  });

  it('lets user overrides take precedence over the built-in table', () => {
    const cost = calculateMetaCost(
      'muse-spark-1.1',
      { inputCost: 2 / 1e6, outputCost: 8 / 1e6, cacheReadCost: 1 / 1e6 },
      1000,
      500,
      400,
    );
    expect(cost).toBeCloseTo((600 * 2 + 400 * 1 + 500 * 8) / 1e6, 12);
  });

  it('applies a flat cost override to prompt and completion tokens', () => {
    expect(calculateMetaCost('muse-unknown', { cost: 0.000002 }, 1000, 500)).toBeCloseTo(0.003, 10);
  });

  it('applies a flat cost override to cached tokens too (beats the built-in cached rate)', () => {
    expect(calculateMetaCost('muse-spark-1.1', { cost: 2 / 1e6 }, 1000, 500, 400)).toBeCloseTo(
      (1000 * 2 + 500 * 2) / 1e6,
      12,
    );
  });

  it('bills cached tokens at a user inputCost when no cacheReadCost is given', () => {
    const cost = calculateMetaCost(
      'muse-spark-1.1',
      { inputCost: 2 / 1e6, outputCost: 8 / 1e6 },
      1000,
      500,
      400,
    );
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 12);
  });
});

describe('MetaProvider callApi cost', () => {
  const okResponse = {
    data: {
      choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      usage: {
        total_tokens: 15,
        prompt_tokens: 10,
        completion_tokens: 5,
        prompt_tokens_details: { cached_tokens: 4 },
      },
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  it('fills in cost from the built-in price table (incl. cached tokens)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|k' },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeCloseTo((6 * 1.25 + 4 * 0.15 + 5 * 4.25) / 1e6, 12);
  });

  it('leaves cost undefined for unknown models without user pricing', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMetaProvider('meta:chat:muse-future', {
      config: { apiKey: 'LLM|1|k' },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeUndefined();
  });

  it('honours prompt-level cost overrides like the base billing path', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|k' },
    });
    const result = await provider.callApi('Say hi', {
      prompt: { raw: 'Say hi', label: 'test', config: { cost: 0 } },
      vars: {},
    });
    expect(result.cost).toBe(0);
  });

  it('does not attach cost to error responses', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { error: { message: 'Too many requests', type: 'rate_limit_exceeded' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as any);
    const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|k' },
    });
    const result = await provider.callApi('Say hi');
    expect(result.error).toBeTruthy();
    expect(result.cost).toBeUndefined();
  });

  it('does not fill cost for cached responses', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({ ...okResponse, cached: true } as any);
    const provider = createMetaProvider('meta:chat:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|k' },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cached).toBe(true);
    expect(result.cost).toBeUndefined();
  });
});

describe('MetaResponsesProvider', () => {
  it('points at the Meta base URL and key envar by default', () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1') as MetaResponsesProvider;
    expect(provider.config.apiBaseUrl).toBe('https://api.meta.ai/v1');
    expect(provider.config.apiKeyEnvar).toBe('MODEL_API_KEY');
    expect((provider as any).getApiUrl()).toBe('https://api.meta.ai/v1');
  });

  it('resolves keys like the chat provider (no OPENAI_API_KEY fallback)', () => {
    const restore = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      MODEL_API_KEY: undefined,
    });
    try {
      const provider = createMetaProvider('meta:responses:muse-spark-1.1');
      expect((provider as any).getApiKey()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { apiKey: 'LLM|123|secret' },
    }) as MetaResponsesProvider;
    const json = provider.toJSON();
    expect(json.provider).toBe('meta:responses');
    expect(JSON.stringify(json)).not.toContain('LLM|123|secret');
  });

  it('fills in cost from Responses API usage', () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1') as MetaResponsesProvider;
    const billed = (provider as any).applyBilling(
      { output: 'hi' },
      {
        usage: {
          input_tokens: 1000,
          output_tokens: 500,
          input_tokens_details: { cached_tokens: 400 },
        },
      },
      provider.config,
      false,
    );
    expect(billed.cost).toBeCloseTo((600 * 1.25 + 400 * 0.15 + 500 * 4.25) / 1e6, 12);
  });

  it('reports zero-cost for cached responses via the base billing path', () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1') as MetaResponsesProvider;
    const billed = (provider as any).applyBilling(
      { output: 'hi' },
      { usage: { input_tokens: 1000, output_tokens: 500 } },
      provider.config,
      true,
    );
    expect(billed.cost).toBeUndefined();
  });
});

describe('MetaResponsesProvider request body shaping', () => {
  it('maps chat-style max_completion_tokens onto max_output_tokens', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { max_completion_tokens: 4096 },
    });
    const { body } = await (provider as any).getOpenAiBody('Hello');
    expect(body.max_output_tokens).toBe(4096);
  });

  it('maps max_tokens onto max_output_tokens', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { max_tokens: 2048 },
    });
    const { body } = await (provider as any).getOpenAiBody('Hello');
    expect(body.max_output_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
  });

  it('maps passthrough max_tokens onto max_output_tokens instead of dropping it', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { max_output_tokens: 4096, passthrough: { max_tokens: 2048 } },
    });
    const { body } = await (provider as any).getOpenAiBody('Hello');
    expect(body.max_output_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
  });

  it('maps a passthrough chat completion cap onto max_output_tokens', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { passthrough: { max_completion_tokens: 2048 } },
    });

    const { body } = await (provider as any).getOpenAiBody('Hello');

    expect(body.max_output_tokens).toBe(2048);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('preserves an explicit top_p when reasoning is enabled', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { reasoning_effort: 'high', top_p: 0.7 },
    });

    const { body } = await (provider as any).getOpenAiBody('Hello');

    expect(body.reasoning?.effort).toBe('high');
    expect(body.top_p).toBe(0.7);
  });

  it('does not leak OPENAI_* env defaults into Responses requests', async () => {
    const restore = mockProcessEnv({
      OPENAI_MAX_COMPLETION_TOKENS: '256',
      OPENAI_TEMPERATURE: '0.9',
      OPENAI_TOP_P: '0.5',
    });
    try {
      const provider = createMetaProvider('meta:responses:muse-spark-1.1');
      const { body } = await (provider as any).getOpenAiBody('Hello');
      expect(body.max_output_tokens).toBeUndefined();
      expect(body.temperature).toBe(0);
      expect(body.top_p).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('forwards reasoning_effort as reasoning.effort, including xhigh', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { reasoning_effort: 'xhigh' },
    });
    const { body } = await (provider as any).getOpenAiBody('Hello');
    expect(body.reasoning?.effort).toBe('xhigh');
  });

  it("rejects reasoning_effort 'none' with a clear error", async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { reasoning_effort: 'none' },
    });
    await expect((provider as any).getOpenAiBody('Hello')).rejects.toThrow(
      /reasoning_effort 'none'/,
    );
  });

  it('rejects configured stop sequences instead of silently dropping them', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { stop: ['\n'] },
    });
    await expect((provider as any).getOpenAiBody('Hello')).rejects.toThrow(/stop/);
  });

  it.each([
    [{ stop: ['\n'] }, /stop/],
    [{ logprobs: true }, /logprobs/],
    [{ logit_bias: { '50256': -100 } }, /logit_bias/],
    [{ n: 2 }, /n > 1/],
    [{ stream: true }, /streaming is not supported/],
  ])('rejects unsupported Responses passthrough options: %j', async (passthrough, error) => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { passthrough },
    });
    await expect((provider as any).getOpenAiBody('Hello')).rejects.toThrow(error);
  });

  it('rejects configured Responses streaming before attempting to parse SSE as JSON', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { stream: true },
    });
    await expect((provider as any).getOpenAiBody('Hello')).rejects.toThrow(
      /streaming is not supported/,
    );
  });

  it('rejects unsupported Responses logprobs includes before making a request', async () => {
    const provider = createMetaProvider('meta:responses:muse-spark-1.1', {
      config: { include: ['message.output_text.logprobs'] },
    });

    await expect((provider as any).getOpenAiBody('Hello')).rejects.toThrow(/logprobs/);
  });
});

describe('MetaMessagesProvider', () => {
  it('keeps response caching enabled when suppressed Anthropic custom headers are configured', async () => {
    const restore = mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Proxy-Secret: do-not-forward' });
    enableCache();
    const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
      config: { apiKey: 'LLM|1|cache-key', stream: false },
    }) as MetaMessagesProvider;
    const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      id: 'msg-cache',
      type: 'message',
      role: 'assistant',
      model: 'muse-spark-1.1',
      content: [{ type: 'text', text: 'cached response' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 2, output_tokens: 1 },
    } as any);

    try {
      const first = await provider.callApi('Cache this prompt');
      const second = await provider.callApi('Cache this prompt');

      expect(first.cached).not.toBe(true);
      expect(second.cached).toBe(true);
      expect(create).toHaveBeenCalledTimes(1);
    } finally {
      await clearCache();
      restore();
    }
  });

  it('points the Anthropic SDK client at the bare Meta host with bearer auth', () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: 'LLM|1|messages-key' });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      expect((provider as any).getApiBaseUrl()).toBe('https://api.meta.ai');
      // Meta authenticates with Authorization: Bearer, not x-api-key.
      expect((provider as any).anthropic.authToken).toBe('LLM|1|messages-key');
      expect((provider as any).anthropic.apiKey).toBeNull();
    } finally {
      restore();
    }
  });

  it('ignores Anthropic-scoped env configuration (base URL and API key)', () => {
    const restore = mockProcessEnv({
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      MODEL_API_KEY: undefined,
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      expect((provider as any).getApiKey()).toBeUndefined();
      expect((provider as any).getApiBaseUrl()).toBe('https://api.meta.ai');
    } finally {
      restore();
    }
  });

  it('hides encrypted redacted_thinking output by default (showThinking: false)', () => {
    const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
    expect((provider as any).config.showThinking).toBe(false);
    const explicit = createMetaProvider('meta:messages:muse-spark-1.1', {
      config: { showThinking: true },
    }) as MetaMessagesProvider;
    expect((explicit as any).config.showThinking).toBe(true);
  });

  it('uses the full Muse output budget and ignores Anthropic-scoped sampling defaults', () => {
    const restore = mockProcessEnv({
      ANTHROPIC_MAX_TOKENS: '1024',
      ANTHROPIC_TEMPERATURE: '0.9',
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        env: { ANTHROPIC_TEMPERATURE: '0.7' },
      }) as MetaMessagesProvider;
      expect((provider as any).config.max_tokens).toBe(131_072);
      expect((provider as any).config.temperature).toBe(0);
      expect((provider as any).config.stream).toBe(true);

      const explicit = createMetaProvider('meta:messages:muse-spark-1.1', {
        config: { max_tokens: 8192, temperature: 0.3, stream: false },
      }) as MetaMessagesProvider;
      expect((explicit as any).config.max_tokens).toBe(8192);
      expect((explicit as any).config.temperature).toBe(0.3);
      expect((explicit as any).config.stream).toBe(false);
    } finally {
      restore();
    }
  });

  it('does not log the unknown-Anthropic-model warning for Muse models', async () => {
    const logger = (await import('../../src/logger')).default;
    vi.mocked(logger.warn).mockClear();
    createMetaProvider('meta:messages:muse-spark-1.1');
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('unknown Anthropic model'),
    );
    // The warning still fires for directly-constructed Anthropic providers.
    new AnthropicMessagesProvider('not-a-real-model');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown Anthropic model'));
  });

  it('never authenticates with a Claude Code OAuth credential, even when one exists', () => {
    expect((MetaMessagesProvider as any).SUPPORTS_CLAUDE_CODE_OAUTH).toBe(false);
    const restore = mockProcessEnv({ MODEL_API_KEY: undefined });
    try {
      // Sanity-check the mock: the plain Anthropic provider WOULD pick up the
      // mocked OAuth credential under this config.
      const restoreAnthropic = mockProcessEnv({ ANTHROPIC_API_KEY: undefined });
      const anthropicProvider = new AnthropicMessagesProvider('claude-sonnet-4-5', {
        config: { apiKeyRequired: false },
      });
      restoreAnthropic();
      expect((anthropicProvider as any).usingClaudeCodeOAuth).toBe(true);

      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        config: { apiKeyRequired: false },
      }) as MetaMessagesProvider;
      expect(vi.mocked(loadClaudeCodeCredential)).toHaveBeenCalled();
      expect((provider as any).usingClaudeCodeOAuth).toBe(false);
      expect((provider as any).anthropic.authToken).not.toBe('claude-code-oauth-secret');
    } finally {
      restore();
    }
  });

  it('resolves empty-string apiBaseUrl to the Meta host, never the SDK Anthropic default', () => {
    const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
      config: { apiBaseUrl: '' },
    }) as MetaMessagesProvider;
    expect((provider as any).getApiBaseUrl()).toBe('https://api.meta.ai');
    expect((provider as any).anthropic.baseURL).toBe('https://api.meta.ai');
  });

  it('omits ANTHROPIC_CUSTOM_HEADERS-derived headers from Meta traffic', () => {
    const restore = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS: 'X-Proxy-Secret: hunter2\nX-Gateway: internal',
    });
    try {
      expect(getAnthropicEnvHeaderSuppressions()).toEqual({
        'X-Proxy-Secret': null,
        'X-Gateway': null,
      });
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      const defaultHeaders = (provider as any).anthropic._options?.defaultHeaders;
      expect(defaultHeaders).toMatchObject({ 'X-Proxy-Secret': null, 'X-Gateway': null });
    } finally {
      restore();
    }
  });

  it('preserves Meta bearer auth when ANTHROPIC_CUSTOM_HEADERS contains Authorization', async () => {
    const restore = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS:
        'Authorization: Bearer anthropic-proxy-secret\nX-Proxy-Secret: hunter2',
      MODEL_API_KEY: 'LLM|1|messages-key',
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      const { req } = await (provider as any).anthropic.buildRequest({
        method: 'post',
        path: '/v1/messages',
        body: {
          model: 'muse-spark-1.1',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hello' }],
        },
      });
      const headers = new Headers(req.headers);
      expect(headers.get('authorization')).toBe('Bearer LLM|1|messages-key');
      expect(headers.has('x-proxy-secret')).toBe(false);
      expect(headers.has('x-api-key')).toBe(false);
    } finally {
      restore();
    }
  });

  it('suppresses every duplicate-case Anthropic header before calling Meta', async () => {
    const restore = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS:
        'Authorization: Bearer first-secret\nauthorization: Bearer second-secret\nX-Proxy-Secret: first-proxy\nx-proxy-secret: second-proxy',
      MODEL_API_KEY: 'LLM|1|messages-key',
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      const { req } = await (provider as any).anthropic.buildRequest({
        method: 'post',
        path: '/v1/messages',
        body: { model: 'muse-spark-1.1', max_tokens: 1, messages: [] },
      });
      const headers = new Headers(req.headers);

      expect(headers.get('authorization')).toBe('Bearer LLM|1|messages-key');
      expect(headers.has('x-proxy-secret')).toBe(false);
    } finally {
      restore();
    }
  });

  it('preserves Meta bearer auth when ambient and scoped Anthropic headers differ only by casing', async () => {
    const restore = mockProcessEnv({
      ANTHROPIC_CUSTOM_HEADERS: 'Authorization: Bearer ambient-secret',
      MODEL_API_KEY: 'LLM|1|messages-key',
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        env: { ANTHROPIC_CUSTOM_HEADERS: 'authorization: Bearer scoped-secret' },
      }) as MetaMessagesProvider;
      const { req } = await (provider.anthropic as any).buildRequest({
        method: 'post',
        path: '/v1/messages',
        body: { model: 'muse-spark-1.1', max_tokens: 1, messages: [] },
      });

      expect(req.headers.get('authorization')).toBe('Bearer LLM|1|messages-key');
    } finally {
      restore();
    }
  });

  it('suppresses SDK environment headers even when suite env overrides clear them', () => {
    const restore = mockProcessEnv({ ANTHROPIC_CUSTOM_HEADERS: 'X-Proxy-Secret: hunter2' });
    const previousConfig = cliState.config;
    cliState.config = { ...previousConfig, env: { ANTHROPIC_CUSTOM_HEADERS: '' } } as any;

    try {
      expect(getAnthropicEnvHeaderSuppressions()).toEqual({ 'X-Proxy-Secret': null });
    } finally {
      cliState.config = previousConfig;
      restore();
    }
  });

  it('does not forward suite-scoped Anthropic custom headers to Meta', async () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: 'LLM|1|messages-key' });
    const previousConfig = cliState.config;
    cliState.config = {
      ...previousConfig,
      env: { ANTHROPIC_CUSTOM_HEADERS: 'X-Proxy-Secret: suite-secret' },
    } as any;

    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1') as MetaMessagesProvider;
      const { req } = await (provider as any).anthropic.buildRequest({
        method: 'post',
        path: '/v1/messages',
        body: {
          model: 'muse-spark-1.1',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hello' }],
        },
      });

      expect(new Headers(req.headers).has('x-proxy-secret')).toBe(false);
    } finally {
      cliState.config = previousConfig;
      restore();
    }
  });

  it('throws the Meta-specific missing-key error from callApi', async () => {
    const restore = mockProcessEnv({ MODEL_API_KEY: undefined });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1');
      await expect(provider.callApi('Hello')).rejects.toThrow(/Meta Model API key is not set/);
    } finally {
      restore();
    }
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
      config: { apiKey: 'LLM|123|secret' },
    }) as MetaMessagesProvider;
    const json = provider.toJSON();
    expect(json.provider).toBe('meta:messages');
    expect(JSON.stringify(json)).not.toContain('LLM|123|secret');
  });

  it('fills in cost from Anthropic-format usage (cache reads billed at the cached rate)', async () => {
    const spy = vi.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValueOnce({
      output: 'hi',
      tokenUsage: {
        // Anthropic-format: prompt is total input incl. cache reads.
        total: 1500,
        prompt: 1000,
        completion: 500,
        completionDetails: { cacheReadInputTokens: 400, cacheCreationInputTokens: 0 },
      },
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        config: { apiKey: 'LLM|1|k' },
      });
      const result = await provider.callApi('Say hi');
      expect(result.cost).toBeCloseTo((600 * 1.25 + 400 * 0.15 + 500 * 4.25) / 1e6, 12);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not attach cost to usage-less error responses or cached responses', async () => {
    const spy = vi
      .spyOn(AnthropicMessagesProvider.prototype, 'callApi')
      .mockResolvedValueOnce({ error: 'API error: 429' })
      .mockResolvedValueOnce({
        output: 'hi',
        cached: true,
        tokenUsage: { cached: 1500, total: 1500 },
      });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        config: { apiKey: 'LLM|1|k' },
      });
      const errored = await provider.callApi('Say hi');
      expect(errored.error).toBeTruthy();
      expect(errored.cost).toBeUndefined();
      const cachedResult = await provider.callApi('Say hi');
      expect(cachedResult.cost).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('bills errors that carry tokenUsage (base class intent for MCP-loop failures)', async () => {
    const spy = vi.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValueOnce({
      error: 'Exceeded max_tool_calls (8)',
      tokenUsage: { total: 1500, prompt: 1000, completion: 500 },
    });
    try {
      const provider = createMetaProvider('meta:messages:muse-spark-1.1', {
        config: { apiKey: 'LLM|1|k' },
      });
      const result = await provider.callApi('Say hi');
      expect(result.error).toBeTruthy();
      expect(result.cost).toBeCloseTo((1000 * 1.25 + 500 * 4.25) / 1e6, 12);
    } finally {
      spy.mockRestore();
    }
  });
});
