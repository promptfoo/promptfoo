import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { calculateMoonshotCost, createMoonshotProvider } from '../../src/providers/moonshot';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The provider extends OpenAiChatCompletionProvider; the Moonshot-specific
// wiring (routing, base URL, key resolution, sampling-param handling, cost) is
// what we assert here. The underlying HTTP behaviour is covered by the OpenAI
// provider's own tests.
function asChat(provider: ReturnType<typeof createMoonshotProvider>) {
  return provider as unknown as OpenAiChatCompletionProvider & {
    getApiUrl: () => string;
    getOrganization: () => unknown;
    getOpenAiBody: (prompt: string) => Promise<{ body: any; config: any }>;
    toJSON: () => any;
  };
}

describe('createMoonshotProvider routing', () => {
  it('parses moonshot:<model>', () => {
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k');
    expect(provider.id()).toBe('moonshot:moonshot-v1-8k');
    expect(asChat(provider).modelName).toBe('moonshot-v1-8k');
  });

  it('parses moonshot:chat:<model> to the same model', () => {
    const provider = createMoonshotProvider('moonshot:chat:moonshot-v1-8k');
    expect(provider.id()).toBe('moonshot:moonshot-v1-8k');
    expect(asChat(provider).modelName).toBe('moonshot-v1-8k');
  });

  it('preserves dotted Kimi version ids', () => {
    const provider = createMoonshotProvider('moonshot:kimi-k2.6');
    expect(asChat(provider).modelName).toBe('kimi-k2.6');
  });

  it('falls back to the default model for a bare prefix', () => {
    expect(asChat(createMoonshotProvider('moonshot:')).modelName).toBe('kimi-k3');
    expect(asChat(createMoonshotProvider('moonshot:chat')).modelName).toBe('kimi-k3');
    expect(asChat(createMoonshotProvider('moonshot:chat:')).modelName).toBe('kimi-k3');
  });
});

describe('MoonshotProvider configuration', () => {
  it('points at the Moonshot base URL and key envar by default', () => {
    const provider = asChat(createMoonshotProvider('moonshot:moonshot-v1-8k'));
    expect(provider.config.apiBaseUrl).toBe('https://api.moonshot.ai/v1');
    expect(provider.config.apiKeyEnvar).toBe('MOONSHOT_API_KEY');
    expect(provider.getApiUrl()).toBe('https://api.moonshot.ai/v1');
  });

  it('lets the user override the base URL (e.g. the China endpoint)', () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { apiBaseUrl: 'https://api.moonshot.cn/v1' },
      }),
    );
    expect(provider.config.apiBaseUrl).toBe('https://api.moonshot.cn/v1');
    expect(provider.getApiUrl()).toBe('https://api.moonshot.cn/v1');
  });

  it('passes through standard OpenAI options without dropping them', () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { temperature: 0.2, max_tokens: 256 },
      }),
    );
    expect(provider.config.temperature).toBe(0.2);
    expect(provider.config.max_tokens).toBe(256);
  });

  it('reports itself as a Moonshot provider', () => {
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k');
    expect(provider.toString()).toBe('[Moonshot Provider moonshot-v1-8k]');
    expect(asChat(provider).toJSON()).toMatchObject({
      provider: 'moonshot',
      model: 'moonshot-v1-8k',
    });
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { apiKey: 'sk-secret', temperature: 0.2 },
      }),
    );
    const json = provider.toJSON();
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toContain('sk-secret');
  });
});

describe('MoonshotProvider key resolution', () => {
  it('resolves apiKey from config', () => {
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { apiKey: 'sk-from-config' },
    });
    expect((provider as any).getApiKey()).toBe('sk-from-config');
  });

  it('resolves apiKey from the MOONSHOT_API_KEY env var', () => {
    const restore = mockProcessEnv({ MOONSHOT_API_KEY: 'sk-from-env' });
    try {
      const provider = createMoonshotProvider('moonshot:moonshot-v1-8k');
      expect((provider as any).getApiKey()).toBe('sk-from-env');
    } finally {
      restore();
    }
  });

  it('does NOT fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
    const restore = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
    });
    try {
      const provider = asChat(createMoonshotProvider('moonshot:moonshot-v1-8k'));
      expect((provider as any).getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('honours a custom apiKeyEnvar', () => {
    const restore = mockProcessEnv({ CUSTOM_MOONSHOT_KEY: 'sk-custom' });
    try {
      const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { apiKeyEnvar: 'CUSTOM_MOONSHOT_KEY' },
      });
      expect((provider as any).getApiKey()).toBe('sk-custom');
    } finally {
      restore();
    }
  });
});

describe('MoonshotProvider sampling-param handling', () => {
  it('omits promptfoo default sampling/token params for Kimi models', async () => {
    const provider = asChat(createMoonshotProvider('moonshot:kimi-k2.6'));
    const { body } = await provider.getOpenAiBody('Hello');
    // Kimi rejects any non-default temperature and needs the 32k server budget.
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.presence_penalty).toBeUndefined();
    expect(body.frequency_penalty).toBeUndefined();
  });

  it('preserves explicit sampling/token params for Kimi models', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k2.6', {
        config: { temperature: 1, max_tokens: 2048 },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.temperature).toBe(1);
    // max_tokens is a deprecated alias upstream; the provider maps it onto the
    // canonical max_completion_tokens field.
    expect(body.max_completion_tokens).toBe(2048);
    expect(body.max_tokens).toBeUndefined();
  });

  it('forwards max_completion_tokens for Kimi (not the injected 1024 max_tokens default)', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k2.6', {
        config: { max_completion_tokens: 4096 },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    // The base drops max_completion_tokens for non-reasoning models and injects
    // max_tokens: 1024; re-attach the caller's value on the canonical field.
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.max_tokens).toBeUndefined();
  });

  it('does not leak OPENAI_* sampling env defaults into Kimi requests', async () => {
    const restore = mockProcessEnv({
      OPENAI_TOP_P: '0.5',
      OPENAI_PRESENCE_PENALTY: '0.7',
      OPENAI_FREQUENCY_PENALTY: '0.9',
    });
    try {
      const provider = asChat(createMoonshotProvider('moonshot:kimi-k2.6'));
      const { body } = await provider.getOpenAiBody('Hello');
      expect(body.top_p).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('omits promptfoo default sampling/token params for kimi-k3 as well', async () => {
    const provider = asChat(createMoonshotProvider('moonshot:kimi-k3'));
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.temperature).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it('forwards an explicit reasoning_effort for kimi-k3 models', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k3', {
        config: { reasoning_effort: 'max' },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    // The OpenAI base only sends reasoning_effort for its own reasoning models,
    // so the Moonshot provider re-attaches it for kimi-k3 requests.
    expect(body.reasoning_effort).toBe('max');
  });

  it('does not inject reasoning_effort when unset', async () => {
    const provider = asChat(createMoonshotProvider('moonshot:kimi-k3'));
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('renders vars in reasoning_effort before forwarding', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k3', {
        config: { reasoning_effort: '{{ effort }}' as any },
      }),
    );
    const { body } = await (provider.getOpenAiBody as any)('Hello', {
      prompt: { raw: 'Hello', label: 'test' },
      vars: { effort: 'max' },
    });
    expect(body.reasoning_effort).toBe('max');
  });

  it('prefers a prompt-level max_tokens over a provider-level max_completion_tokens', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k3', {
        config: { max_completion_tokens: 4096 },
      }),
    );
    const { body } = await (provider.getOpenAiBody as any)('Hello', {
      prompt: { raw: 'Hello', label: 'test', config: { max_tokens: 1000 } },
      vars: {},
    });
    expect(body.max_completion_tokens).toBe(1000);
    expect(body.max_tokens).toBeUndefined();
  });

  it('prefers a prompt-level max_completion_tokens over a provider-level max_tokens', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k3', {
        config: { max_tokens: 2048 },
      }),
    );
    const { body } = await (provider.getOpenAiBody as any)('Hello', {
      prompt: { raw: 'Hello', label: 'test', config: { max_completion_tokens: 900 } },
      vars: {},
    });
    expect(body.max_completion_tokens).toBe(900);
    expect(body.max_tokens).toBeUndefined();
  });

  it('fails fast when reasoning_effort is configured on a non-K3 model', async () => {
    const k2 = asChat(
      createMoonshotProvider('moonshot:kimi-k2.6', {
        config: { reasoning_effort: 'max' },
      }),
    );
    await expect(k2.getOpenAiBody('Hello')).rejects.toThrow(
      /kimi-k2\.6 does not support reasoning_effort/,
    );

    const v1 = asChat(
      createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { reasoning_effort: 'max' },
      }),
    );
    await expect(v1.getOpenAiBody('Hello')).rejects.toThrow(/does not support reasoning_effort/);
  });

  it('force-sends reasoning_effort on a non-K3 model via passthrough (the documented escape hatch)', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k2.6', {
        config: { passthrough: { reasoning_effort: 'max' } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    // The fail-fast error message advertises this workaround; keep it working.
    expect(body.reasoning_effort).toBe('max');
  });

  it('keeps promptfoo deterministic defaults for moonshot-v1 generation models', async () => {
    const provider = asChat(createMoonshotProvider('moonshot:moonshot-v1-8k'));
    const { body } = await provider.getOpenAiBody('Hello');
    // moonshot-v1 accepts arbitrary sampling, so the deterministic default stays.
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(1024);
  });
});

describe('calculateMoonshotCost', () => {
  it('returns undefined when no user pricing is configured', () => {
    expect(calculateMoonshotCost({}, 1000, 500)).toBeUndefined();
  });

  it('returns undefined when token counts are missing', () => {
    expect(calculateMoonshotCost({ cost: 0.000002 }, undefined, 500)).toBeUndefined();
    expect(calculateMoonshotCost({ cost: 0.000002 }, 1000, undefined)).toBeUndefined();
  });

  it('applies a flat cost to prompt and completion tokens', () => {
    expect(calculateMoonshotCost({ cost: 0.000002 }, 1000, 500)).toBeCloseTo(0.003, 10);
  });

  it('lets inputCost/outputCost take precedence over the flat cost', () => {
    const cost = calculateMoonshotCost(
      { cost: 0.000002, inputCost: 0.000001, outputCost: 0.000004 },
      1000,
      500,
    );
    expect(cost).toBeCloseTo(1000 * 0.000001 + 500 * 0.000004, 10);
  });

  it('uses per-token rates converted from per-million pricing for mixed cached input', () => {
    const cost = calculateMoonshotCost(
      {
        inputCost: 0.95 / 1_000_000,
        cacheReadCost: 0.16 / 1_000_000,
        outputCost: 4 / 1_000_000,
      },
      1_000,
      500,
      400,
    );

    // 600 uncached input, 400 cached input, and 500 output tokens.
    expect(cost).toBe(0.002634);
  });
});

describe('MoonshotProvider callApi cost', () => {
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

  it('fills in cost from user-supplied rates (incl. cached tokens)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBe(
      calculateMoonshotCost({ inputCost: 0.000002, outputCost: 0.000004 }, 10, 5, 4),
    );
  });

  it('reads cached tokens from the documented top-level usage.cached_tokens field', async () => {
    const moonshotShapedResponse = {
      data: {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        usage: {
          total_tokens: 15,
          prompt_tokens: 10,
          completion_tokens: 5,
          cached_tokens: 4,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(moonshotShapedResponse as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: {
        apiKey: 'k',
        inputCost: 0.000002,
        cacheReadCost: 0.0000002,
        outputCost: 0.000004,
      },
    });
    const result = await provider.callApi('Say hi');
    // 6 uncached + 4 cached input tokens, 5 output tokens.
    expect(result.cost).toBeCloseTo(6 * 0.000002 + 4 * 0.0000002 + 5 * 0.000004, 12);
    // The cache hit must also land in token usage stats, not just cost.
    expect(result.tokenUsage?.completionDetails?.cacheReadInputTokens).toBe(4);
  });

  it('honours prompt-level cost overrides', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi', {
      prompt: { raw: 'Say hi', label: 'test', config: { inputCost: 0.00002 } },
      vars: {},
    });
    expect(result.cost).toBe(
      calculateMoonshotCost({ inputCost: 0.00002, outputCost: 0.000004 }, 10, 5, 4),
    );
  });

  it('leaves cost undefined when no pricing is configured', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { apiKey: 'k' },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeUndefined();
  });

  it('leaves cost undefined for promptfoo cache hits even when pricing is configured', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({ ...okResponse, cached: true } as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cached).toBe(true);
    expect(result.cost).toBeUndefined();
  });
});
