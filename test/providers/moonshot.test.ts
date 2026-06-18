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
    expect(asChat(createMoonshotProvider('moonshot:')).modelName).toBe('kimi-k2.6');
    expect(asChat(createMoonshotProvider('moonshot:chat')).modelName).toBe('kimi-k2.6');
    expect(asChat(createMoonshotProvider('moonshot:chat:')).modelName).toBe('kimi-k2.6');
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
        config: { config: { apiBaseUrl: 'https://api.moonshot.cn/v1' } },
      }),
    );
    expect(provider.config.apiBaseUrl).toBe('https://api.moonshot.cn/v1');
    expect(provider.getApiUrl()).toBe('https://api.moonshot.cn/v1');
  });

  it('passes through standard OpenAI options without dropping them', () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:moonshot-v1-8k', {
        config: { config: { temperature: 0.2, max_tokens: 256 } },
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
        config: { config: { apiKey: 'sk-secret', temperature: 0.2 } },
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
      config: { config: { apiKey: 'sk-from-config' } },
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
        config: { config: { apiKeyEnvar: 'CUSTOM_MOONSHOT_KEY' } },
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
        config: { config: { temperature: 1, max_tokens: 2048 } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body.temperature).toBe(1);
    expect(body.max_tokens).toBe(2048);
  });

  it('maps max_completion_tokens to Moonshot max_tokens for Kimi (not the injected 1024 default)', async () => {
    const provider = asChat(
      createMoonshotProvider('moonshot:kimi-k2.6', {
        config: { config: { max_completion_tokens: 4096 } },
      }),
    );
    const { body } = await provider.getOpenAiBody('Hello');
    // The base drops max_completion_tokens for non-reasoning models and injects
    // max_tokens: 1024; map the caller's value onto Moonshot's max_tokens field.
    expect(body.max_tokens).toBe(4096);
    expect(body.max_completion_tokens).toBeUndefined();
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

  it('bills cached prompt tokens at cacheReadCost when supplied', () => {
    const cost = calculateMoonshotCost(
      { inputCost: 0.000002, outputCost: 0.000004, cacheReadCost: 0.0000005 },
      1000,
      500,
      400,
    );
    const expected = 600 * 0.000002 + 400 * 0.0000005 + 500 * 0.000004;
    expect(cost).toBeCloseTo(expected, 10);
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
      config: { config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 } },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBe(
      calculateMoonshotCost({ inputCost: 0.000002, outputCost: 0.000004 }, 10, 5, 4),
    );
  });

  it('leaves cost undefined when no pricing is configured', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createMoonshotProvider('moonshot:moonshot-v1-8k', {
      config: { config: { apiKey: 'k' } },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeUndefined();
  });
});
