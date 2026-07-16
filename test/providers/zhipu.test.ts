import { describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import {
  calculateZhipuCost,
  createZhipuProvider,
  extractCachedTokens,
} from '../../src/providers/zhipu';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The provider extends OpenAiChatCompletionProvider; the Zhipu-specific wiring
// (routing, base URL, key resolution, cost) is what we assert here. The
// underlying HTTP behaviour is covered by the OpenAI provider's own tests.
function asChat(provider: ReturnType<typeof createZhipuProvider>) {
  return provider as unknown as OpenAiChatCompletionProvider & {
    config: any;
    getApiUrl: () => string;
    getOrganization: () => unknown;
    getOpenAiBody: (prompt: string, context?: any) => Promise<{ body: any; config: any }>;
    getMissingApiKeyErrorMessage: () => string;
    toJSON: () => any;
  };
}

describe('createZhipuProvider routing', () => {
  it('parses zhipu:<model>', () => {
    const provider = createZhipuProvider('zhipu:glm-4.6');
    expect(provider.id()).toBe('zhipu:glm-4.6');
    expect(asChat(provider).modelName).toBe('glm-4.6');
  });

  it('preserves dotted GLM version ids', () => {
    const provider = createZhipuProvider('zhipu:glm-4.5-air');
    expect(asChat(provider).modelName).toBe('glm-4.5-air');
  });

  it('falls back to the default model for a bare prefix', () => {
    expect(asChat(createZhipuProvider('zhipu:')).modelName).toBe('glm-5.2');
  });

  it('accepts the explicit chat sub-type', () => {
    expect(asChat(createZhipuProvider('zhipu:chat:glm-4.6')).modelName).toBe('glm-4.6');
    expect(asChat(createZhipuProvider('zhipu:chat')).modelName).toBe('glm-5.2');
  });

  it('rejects unsupported sub-types instead of routing them to /chat/completions', () => {
    expect(() => createZhipuProvider('zhipu:image:cogview-4')).toThrow(/only supports chat models/);
    expect(() => createZhipuProvider('zhipu:embedding:embedding-3')).toThrow(
      /Unsupported Zhipu sub-type/,
    );
  });

  it('rejects bare non-chat sub-types with no model segment', () => {
    for (const path of [
      'zhipu:embedding',
      'zhipu:embeddings',
      'zhipu:image',
      'zhipu:responses',
      'zhipu:transcription',
      'zhipu:transcription:glm-asr-2512',
    ]) {
      expect(() => createZhipuProvider(path)).toThrow(/Unsupported Zhipu sub-type/);
    }
  });
});

describe('ZhipuProvider configuration', () => {
  it('points at the international Z.ai base URL and key envar by default', () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
    expect(provider.config.apiBaseUrl).toBe('https://api.z.ai/api/paas/v4');
    expect(provider.config.apiKeyEnvar).toBe('ZHIPU_API_KEY');
    expect(provider.getApiUrl()).toBe('https://api.z.ai/api/paas/v4');
  });

  it('lets the user override the base URL (e.g. the China-mainland endpoint)', () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-4.6', {
        config: { apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
      }),
    );
    expect(provider.config.apiBaseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(provider.getApiUrl()).toBe('https://open.bigmodel.cn/api/paas/v4');
  });

  it('passes through standard OpenAI options without dropping them', () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-4.6', {
        config: { temperature: 0.2, max_tokens: 256 },
      }),
    );
    expect(provider.config.temperature).toBe(0.2);
    expect(provider.config.max_tokens).toBe(256);
  });

  it('reports itself as a Zhipu provider', () => {
    const provider = createZhipuProvider('zhipu:glm-4.6');
    expect(provider.toString()).toBe('[Zhipu Provider glm-4.6]');
    expect(asChat(provider).toJSON()).toMatchObject({
      provider: 'zhipu',
      model: 'glm-4.6',
    });
  });

  it('redacts an explicit apiKey from toJSON output', () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-4.6', {
        config: { apiKey: 'sk-secret', temperature: 0.2 },
      }),
    );
    const json = provider.toJSON();
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.2);
    expect(JSON.stringify(json)).not.toContain('sk-secret');
  });
});

describe('ZhipuProvider key resolution', () => {
  it('resolves apiKey from config', () => {
    const provider = createZhipuProvider('zhipu:glm-4.6', {
      config: { apiKey: 'sk-from-config' },
    });
    expect((provider as any).getApiKey()).toBe('sk-from-config');
  });

  it('resolves apiKey from the ZHIPU_API_KEY env var', () => {
    const restore = mockProcessEnv({ ZHIPU_API_KEY: 'sk-from-env' });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6');
      expect((provider as any).getApiKey()).toBe('sk-from-env');
    } finally {
      restore();
    }
  });

  it('falls back to the ZAI_API_KEY env var', () => {
    const restore = mockProcessEnv({ ZHIPU_API_KEY: undefined, ZAI_API_KEY: 'sk-from-zai' });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6');
      expect((provider as any).getApiKey()).toBe('sk-from-zai');
    } finally {
      restore();
    }
  });

  it('prefers ZHIPU_API_KEY over ZAI_API_KEY', () => {
    const restore = mockProcessEnv({ ZHIPU_API_KEY: 'sk-zhipu', ZAI_API_KEY: 'sk-zai' });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6');
      expect((provider as any).getApiKey()).toBe('sk-zhipu');
    } finally {
      restore();
    }
  });

  it('resolves ZAI_API_KEY from the per-provider env overrides object', () => {
    const restore = mockProcessEnv({ ZHIPU_API_KEY: undefined, ZAI_API_KEY: undefined });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6', {
        env: { ZAI_API_KEY: 'sk-zai-override' } as any,
      });
      expect((provider as any).getApiKey()).toBe('sk-zai-override');
    } finally {
      restore();
    }
  });

  it('does NOT fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
    const restore = mockProcessEnv({
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_ORGANIZATION: 'org-openai-secret',
      ZHIPU_API_KEY: undefined,
    });
    try {
      const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
      expect((provider as any).getApiKey()).toBeUndefined();
      expect(provider.getOrganization()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('honours a custom apiKeyEnvar', () => {
    const restore = mockProcessEnv({ CUSTOM_ZHIPU_KEY: 'sk-custom' });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6', {
        config: { apiKeyEnvar: 'CUSTOM_ZHIPU_KEY' },
      });
      expect((provider as any).getApiKey()).toBe('sk-custom');
    } finally {
      restore();
    }
  });

  it('resolves apiKey from the per-provider env overrides object', () => {
    const provider = createZhipuProvider('zhipu:glm-4.6', {
      env: { ZHIPU_API_KEY: 'sk-from-env-override' } as any,
    });
    expect((provider as any).getApiKey()).toBe('sk-from-env-override');
  });

  it('explains how to set the key when it is missing', () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
    const message = provider.getMissingApiKeyErrorMessage();
    expect(message).toContain('ZHIPU_API_KEY');
    expect(message).toContain('ZAI_API_KEY');
    expect(message).toContain('apiKey');
  });

  it('ignores a per-provider env override whose value is undefined', () => {
    const restore = mockProcessEnv({ ZHIPU_API_KEY: undefined });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6', {
        env: { ZHIPU_API_KEY: undefined } as any,
      });
      expect((provider as any).getApiKey()).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('returns undefined when apiKeyEnvar is empty', () => {
    const provider = createZhipuProvider('zhipu:glm-4.6', {
      config: { apiKeyEnvar: '' },
    });
    expect((provider as any).getApiKey()).toBeUndefined();
  });

  it('falls back to the default base URL when apiBaseUrl is absent', () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
    provider.config.apiBaseUrl = undefined;
    expect(provider.getApiUrl()).toBe('https://api.z.ai/api/paas/v4');
  });

  it('names the default envar in the missing-key message when apiKeyEnvar is absent', () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
    provider.config.apiKeyEnvar = undefined;
    expect(provider.getMissingApiKeyErrorMessage()).toContain('ZHIPU_API_KEY');
  });
});

describe('ZhipuProvider GLM thinking parameter', () => {
  it('does not send a thinking param by default (GLM reasons by default)', async () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-4.6'));
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.thinking).toBeUndefined();
  });

  it('does not set the thinking param from showThinking (display-only flag)', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-4.6', { config: { showThinking: false } }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.thinking).toBeUndefined();
  });

  it('sends an explicit GLM-native thinking param', async () => {
    for (const type of ['enabled', 'disabled'] as const) {
      const provider = asChat(
        createZhipuProvider('zhipu:glm-4.6', { config: { thinking: { type } } }),
      );
      const { body } = await provider.getOpenAiBody('hello');
      expect(body.thinking).toEqual({ type });
    }
  });

  it('forwards reasoning_effort (high/max), which GLM-5.2 honors', async () => {
    for (const effort of ['high', 'max'] as const) {
      const provider = asChat(
        createZhipuProvider('zhipu:glm-5.2', {
          config: { reasoning_effort: effort } as any,
        }),
      );
      const { body } = await provider.getOpenAiBody('hello');
      expect(body.reasoning_effort).toBe(effort);
    }
  });

  it('keeps reasoning_effort when showThinking is false (display-only, reasoning still on)', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { showThinking: false, reasoning_effort: 'high' } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBe('high');
  });

  it('drops reasoning_effort when thinking is explicitly disabled', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { thinking: { type: 'disabled' }, reasoning_effort: 'max' } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('keeps reasoning_effort when thinking is enabled alongside it', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { thinking: { type: 'enabled' }, reasoning_effort: 'high' } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.reasoning_effort).toBe('high');
  });

  it('honors a prompt-level thinking override over the provider default', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', { config: { thinking: { type: 'disabled' } } }),
    );
    const { body } = await provider.getOpenAiBody('hello', {
      prompt: { raw: 'hello', label: 'hello', config: { thinking: { type: 'enabled' } } },
      vars: {},
    });
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  it('renders a templated reasoning_effort from vars before forwarding', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { reasoning_effort: '{{effort}}' } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello', {
      prompt: { raw: 'hello', label: 'hello' },
      vars: { effort: 'high' },
    });
    expect(body.reasoning_effort).toBe('high');
  });

  it('renders a templated thinking type from vars', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', { config: { thinking: { type: '{{mode}}' } } as any }),
    );
    const { body } = await provider.getOpenAiBody('hello', {
      prompt: { raw: 'hello', label: 'hello' },
      vars: { mode: 'enabled' },
    });
    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  it('drops reasoning_effort when a templated thinking renders to disabled', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { thinking: { type: '{{mode}}' }, reasoning_effort: 'high' } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello', {
      prompt: { raw: 'hello', label: 'hello' },
      vars: { mode: 'disabled' },
    });
    expect(body.reasoning_effort).toBeUndefined();
  });
});

describe('calculateZhipuCost', () => {
  // `unknown-glm` is not in the built-in table, so these isolate the user-rate path.
  it('returns undefined for an unknown model when the user supplies no rates', () => {
    expect(calculateZhipuCost('unknown-glm', {}, 100, 50)).toBeUndefined();
  });

  it('returns undefined when token counts are missing', () => {
    expect(calculateZhipuCost('unknown-glm', { cost: 0.001 }, undefined, 50)).toBeUndefined();
  });

  it('computes cost from a flat per-token rate', () => {
    // 100 prompt + 50 completion at 0.001 each = 0.15
    expect(calculateZhipuCost('unknown-glm', { cost: 0.001 }, 100, 50)).toBeCloseTo(0.15, 6);
  });

  it('lets inputCost/outputCost override the flat cost', () => {
    // 100 * 0.002 + 50 * 0.004 = 0.4
    expect(
      calculateZhipuCost('unknown-glm', { inputCost: 0.002, outputCost: 0.004 }, 100, 50),
    ).toBeCloseTo(0.4, 6);
  });

  it('bills cached prompt tokens at cacheReadCost', () => {
    // 20 cached @ 0.0005 + 80 uncached @ 0.002 + 50 completion @ 0.004
    // = 0.01 + 0.16 + 0.2 = 0.37
    const cost = calculateZhipuCost(
      'unknown-glm',
      { inputCost: 0.002, outputCost: 0.004, cacheReadCost: 0.0005 },
      100,
      50,
      20,
    );
    expect(cost).toBeCloseTo(0.37, 6);
  });

  it('bills only completion tokens when just outputCost is set', () => {
    // inputCost undefined + unknown model -> uncached and cached input both cost 0
    expect(calculateZhipuCost('unknown-glm', { outputCost: 0.004 }, 100, 50, 20)).toBeCloseTo(
      0.2,
      6,
    );
  });

  it('bills only prompt tokens when just inputCost is set', () => {
    // outputCost undefined + unknown model -> completion tokens cost 0
    expect(calculateZhipuCost('unknown-glm', { inputCost: 0.002 }, 100, 50)).toBeCloseTo(0.2, 6);
  });

  describe('built-in price table', () => {
    it('prices a known model from the table when no user rates are given', () => {
      // glm-4.6: input 0.6/1e6, output 2.2/1e6, cacheRead 0.11/1e6.
      // 100 prompt (no cache) @ 0.6/1e6 + 50 completion @ 2.2/1e6
      const expected = (0.6 / 1e6) * 100 + (2.2 / 1e6) * 50;
      expect(calculateZhipuCost('glm-4.6', {}, 100, 50)).toBeCloseTo(expected, 12);
    });

    it('bills cached tokens at the table cacheRead rate', () => {
      // glm-4.6: 20 cached @ 0.11/1e6 + 80 uncached @ 0.6/1e6 + 50 completion @ 2.2/1e6
      const expected = (0.11 / 1e6) * 20 + (0.6 / 1e6) * 80 + (2.2 / 1e6) * 50;
      expect(calculateZhipuCost('glm-4.6', {}, 100, 50, 20)).toBeCloseTo(expected, 12);
    });

    it('prices free models as 0', () => {
      expect(calculateZhipuCost('glm-4.5-flash', {}, 100, 50)).toBe(0);
    });

    it('lets user rates override the table', () => {
      // Explicit rates win over glm-4.6 table entry.
      expect(
        calculateZhipuCost('glm-4.6', { inputCost: 0.01, outputCost: 0.02 }, 10, 5),
      ).toBeCloseTo(0.01 * 10 + 0.02 * 5, 12);
    });

    it('returns undefined for a model without a table entry and no user rates', () => {
      expect(calculateZhipuCost('glm-does-not-exist', {}, 100, 50)).toBeUndefined();
    });

    it('applies a user input-rate override to cached tokens, not the table cache rate', () => {
      // glm-4.6 has a table cacheRead of 0.11/1e6, but the user overrode inputCost,
      // so cached tokens should bill at the user rate (0.01), not the table rate.
      const cost = calculateZhipuCost(
        'glm-4.6',
        { inputCost: 0.01, outputCost: 0.02 },
        100,
        50,
        20,
      );
      expect(cost).toBeCloseTo(0.01 * 100 + 0.02 * 50, 12);
    });

    it('still uses the table cache rate when the user sets no input override', () => {
      const cost = calculateZhipuCost('glm-4.6', {}, 100, 50, 20);
      expect(cost).toBeCloseTo((0.11 / 1e6) * 20 + (0.6 / 1e6) * 80 + (2.2 / 1e6) * 50, 12);
    });
  });
});

describe('ZhipuProvider callApi cost', () => {
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
    const provider = createZhipuProvider('zhipu:glm-5.2', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBe(
      calculateZhipuCost('glm-5.2', { inputCost: 0.000002, outputCost: 0.000004 }, 10, 5, 4),
    );
  });

  it('prices a known model from the built-in table without user rates', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createZhipuProvider('zhipu:glm-4.6', { config: { apiKey: 'k' } });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBe(calculateZhipuCost('glm-4.6', {}, 10, 5, 4));
    expect(result.cost).toBeGreaterThan(0);
  });

  it('leaves cost undefined for an unlisted model with no rates', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createZhipuProvider('zhipu:glm-unlisted-model', { config: { apiKey: 'k' } });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeUndefined();
  });

  it('prices using prompt-level rate overrides (merged config)', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(okResponse as any);
    const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
    const result = await provider.callApi('Say hi', {
      prompt: {
        raw: 'Say hi',
        label: 'Say hi',
        config: { inputCost: 0.000002, outputCost: 0.000004 },
      },
      vars: {},
    } as any);
    expect(result.cost).toBe(
      calculateZhipuCost('glm-5.2', { inputCost: 0.000002, outputCost: 0.000004 }, 10, 5, 4),
    );
  });

  it('does not recompute cost for a cached response', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({ ...okResponse, cached: true } as any);
    const provider = createZhipuProvider('zhipu:glm-5.2', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cached).toBe(true);
  });

  it('reads cached tokens from the raw response when usage omits cache details', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
        // No prompt_tokens_details, so tokenUsage carries no cacheReadInputTokens
        // and the provider falls back to extractCachedTokens(response.raw).
        usage: { total_tokens: 15, prompt_tokens: 10, completion_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);
    const provider = createZhipuProvider('zhipu:glm-5.2', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBe(
      calculateZhipuCost('glm-5.2', { inputCost: 0.000002, outputCost: 0.000004 }, 10, 5, 0),
    );
  });

  it('leaves the response untouched when it carries no token usage', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);
    const provider = createZhipuProvider('zhipu:glm-5.2', {
      config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
    });
    const result = await provider.callApi('Say hi');
    expect(result.cost).toBeUndefined();
  });

  it('returns the base response unchanged when it has no token usage at all', async () => {
    const spy = vi
      .spyOn(OpenAiChatCompletionProvider.prototype, 'callApi')
      .mockResolvedValueOnce({ output: 'hi' } as any);
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', {
        config: { apiKey: 'k', inputCost: 0.000002, outputCost: 0.000004 },
      });
      const result = await provider.callApi('Say hi');
      expect(result).toEqual({ output: 'hi' });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ZhipuProvider content-safety guardrails', () => {
  function withBaseResponse(response: unknown) {
    return vi
      .spyOn(OpenAiChatCompletionProvider.prototype, 'callApi')
      .mockResolvedValueOnce(response as any);
  }

  it('flags a generation blocked with finish_reason "sensitive"', async () => {
    const spy = withBaseResponse({ output: '', finishReason: 'sensitive' });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('unsafe');
      expect(result.guardrails).toMatchObject({ flagged: true, flaggedOutput: true });
      expect(result.isRefusal).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not override guardrails already flagged by the base parser', async () => {
    const spy = withBaseResponse({
      output: '',
      finishReason: 'sensitive',
      guardrails: { flagged: true, reason: 'base' },
    });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('unsafe');
      expect(result.guardrails?.reason).toBe('base');
    } finally {
      spy.mockRestore();
    }
  });

  it('maps a 1301 content-safety error to a flagged-input guardrail', async () => {
    const spy = withBaseResponse({
      error: 'API error: 400 Bad Request\n{"error":{"code":1301,"message":"unsafe input"}}',
    });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('unsafe');
      expect(result.error).toBeUndefined();
      expect(result.isRefusal).toBe(true);
      expect(result.guardrails).toMatchObject({ flagged: true, flaggedInput: true });
    } finally {
      spy.mockRestore();
    }
  });

  it('also matches a string-quoted 1301 code', async () => {
    const spy = withBaseResponse({
      error: 'API error: 400\n{"error":{"code":"1301","message":"blocked"}}',
    });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('unsafe');
      expect(result.guardrails?.flagged).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('passes through non-safety errors unchanged', async () => {
    const spy = withBaseResponse({ error: 'API error: 500 Internal Server Error' });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('hi');
      expect(result.error).toBe('API error: 500 Internal Server Error');
      expect(result.guardrails).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('does not treat a longer code starting with 1301 as a safety block', async () => {
    const spy = withBaseResponse({ error: 'API error: 400\n{"error":{"code":13010}}' });
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('hi');
      expect(result.error).toContain('13010');
      expect(result.guardrails).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('still prices a sensitive response that carries token usage', async () => {
    const spy = withBaseResponse({
      output: 'partial',
      finishReason: 'sensitive',
      tokenUsage: { prompt: 10, completion: 5 },
    });
    try {
      const provider = createZhipuProvider('zhipu:glm-4.6', { config: { apiKey: 'k' } });
      const result = await provider.callApi('unsafe');
      expect(result.guardrails?.flagged).toBe(true);
      expect(result.cost).toBe(calculateZhipuCost('glm-4.6', {}, 10, 5, 0));
      expect(result.cost).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns a null base response as-is', async () => {
    const spy = withBaseResponse(null);
    try {
      const provider = createZhipuProvider('zhipu:glm-5.2', { config: { apiKey: 'k' } });
      const result = await provider.callApi('hi');
      expect(result).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('ZhipuProvider max_completion_tokens mapping', () => {
  it('maps max_completion_tokens onto GLM max_tokens', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', { config: { max_completion_tokens: 4096 } as any }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.max_tokens).toBe(4096);
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('prefers an explicit max_tokens over max_completion_tokens', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', {
        config: { max_tokens: 1000, max_completion_tokens: 4096 } as any,
      }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.max_tokens).toBe(1000);
  });

  it('drops the injected 1024 default when neither is set', async () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-5.2'));
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.max_tokens).toBeUndefined();
  });
});

describe('ZhipuProvider user_id mapping', () => {
  it('maps the OpenAI user field onto GLM user_id', async () => {
    const provider = asChat(
      createZhipuProvider('zhipu:glm-5.2', { config: { user: 'end-user-42' } as any }),
    );
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.user_id).toBe('end-user-42');
    expect(body.user).toBeUndefined();
  });

  it('leaves the body alone when no user is set', async () => {
    const provider = asChat(createZhipuProvider('zhipu:glm-5.2'));
    const { body } = await provider.getOpenAiBody('hello');
    expect(body.user_id).toBeUndefined();
    expect(body.user).toBeUndefined();
  });
});

describe('extractCachedTokens', () => {
  it('reads cached tokens from an object response', () => {
    expect(extractCachedTokens({ usage: { prompt_tokens_details: { cached_tokens: 7 } } })).toBe(7);
  });

  it('reads cached tokens from a JSON string response', () => {
    expect(
      extractCachedTokens(
        JSON.stringify({ usage: { prompt_tokens_details: { cached_tokens: 3 } } }),
      ),
    ).toBe(3);
  });

  it('returns 0 for malformed JSON, missing fields, or non-numeric values', () => {
    expect(extractCachedTokens('not json{')).toBe(0);
    expect(extractCachedTokens({ usage: {} })).toBe(0);
    expect(extractCachedTokens({ usage: { prompt_tokens_details: { cached_tokens: 'x' } } })).toBe(
      0,
    );
    expect(extractCachedTokens(undefined)).toBe(0);
  });
});
