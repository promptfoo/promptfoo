import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { calculateMiniMaxCost, createMiniMaxProvider } from '../../src/providers/minimax';
import { createMoonshotProvider } from '../../src/providers/moonshot';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { OpenAiCompletionOptions } from '../../src/providers/openai/types';
import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
let restoreEnv: () => void;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  restoreEnv = mockProcessEnv({
    OPENAI_TEMPERATURE: '0',
    OPENAI_TOP_P: '0.1',
    OPENAI_MAX_TOKENS: '12',
    OPENAI_PRESENCE_PENALTY: '0.2',
    OPENAI_FREQUENCY_PENALTY: '0.3',
  });
});
afterEach(() => restoreEnv());

function makeProvider(name: string, config: OpenAiCompletionOptions) {
  return (
    name === 'minimax'
      ? createMiniMaxProvider('minimax:MiniMax-M3', { config: { config } })
      : createMoonshotProvider('moonshot:kimi-k3', { config })
  ) as OpenAiChatCompletionProvider;
}
function promptContext(config: OpenAiCompletionOptions): CallApiContextParams {
  return { vars: {}, prompt: { raw: 'Hello', label: 'fixture', config } };
}

describe.each(['minimax', 'moonshot'])('%s explicit request options', (name) => {
  it('preserves explicit passthrough sampling while excluding unrelated OpenAI defaults', async () => {
    const { body } = await makeProvider(name, {
      passthrough: { temperature: 0, top_p: 0.7, frequency_penalty: 0 },
    }).getOpenAiBody('Hello');
    expect(body).toMatchObject({ temperature: 0, top_p: 0.7, frequency_penalty: 0 });
    expect(body).not.toHaveProperty('presence_penalty');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it.each(['max_tokens', 'max_completion_tokens'])('normalizes passthrough %s', async (field) => {
    const { body } = await makeProvider(name, { passthrough: { [field]: 17 } }).getOpenAiBody(
      'Hello',
    );
    expect(body.max_completion_tokens).toBe(17);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each([
    [{ max_completion_tokens: 100 }, { max_tokens: 7 }],
    [{ max_tokens: 100 }, { max_completion_tokens: 7 }],
    [{ passthrough: { max_completion_tokens: 100 } }, { max_tokens: 7 }],
    [{ max_completion_tokens: 100 }, { passthrough: { max_tokens: 7 } }],
  ])('prefers prompt token limits across aliases', async (config, promptConfig) => {
    const { body } = await makeProvider(name, config).getOpenAiBody(
      'Hello',
      promptContext(promptConfig),
    );
    expect(body.max_completion_tokens).toBe(7);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('lets passthrough override a same-layer top-level token limit', async () => {
    const { body } = await makeProvider(name, {
      max_completion_tokens: 100,
      passthrough: { max_tokens: 9 },
    }).getOpenAiBody('Hello');
    expect(body.max_completion_tokens).toBe(9);
  });
});

describe('Moonshot effective model policy', () => {
  it('uses the passthrough K3 model for reasoning effort support', async () => {
    const provider = createMoonshotProvider('moonshot:kimi-k2.6', {
      config: { reasoning_effort: 'low', passthrough: { model: 'kimi-k3-private' } },
    }) as OpenAiChatCompletionProvider;
    expect((await provider.getOpenAiBody('Hello')).body).toMatchObject({
      model: 'kimi-k3-private',
      reasoning_effort: 'low',
    });
  });

  it('rejects top-level effort when the effective model is not K3', async () => {
    await expect(
      makeProvider('moonshot', {
        reasoning_effort: 'max',
        passthrough: { model: 'kimi-k2.6' },
      }).getOpenAiBody('Hello'),
    ).rejects.toThrow('kimi-k2.6 does not support reasoning_effort');
  });

  it.each([
    [{ max_completion_tokens: 2000 }, {}, 2000],
    [{ max_tokens: 2000 }, { max_completion_tokens: 7 }, 7],
    [
      { max_completion_tokens: 2000 },
      { passthrough: { model: 'moonshot-v1-8k', max_tokens: 9 } },
      9,
    ],
  ])(
    'preserves explicit token limits for legacy model overrides',
    async (config, promptConfig, expected) => {
      const { body } = await makeProvider('moonshot', {
        ...config,
        passthrough: { model: 'moonshot-v1-8k' },
      }).getOpenAiBody('Hello', promptContext(promptConfig));
      expect(body).toMatchObject({
        model: 'moonshot-v1-8k',
        temperature: 0,
        max_completion_tokens: expected,
      });
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('does not apply Kimi sampling rules to an overridden legacy model', async () => {
    const { body } = await makeProvider('moonshot', {
      passthrough: { model: 'moonshot-v1-private' },
    }).getOpenAiBody('Hello');
    expect(body).toMatchObject({ model: 'moonshot-v1-private', temperature: 0, max_tokens: 12 });
  });
});

describe('MiniMax effective billing', () => {
  function reply(
    cached = false,
    serviceTier?: 'priority' | 'default',
    cacheUsage: Record<string, unknown> = { prompt_tokens_details: { cached_tokens: 40 } },
  ) {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          ...cacheUsage,
        },
        ...(serviceTier ? { service_tier: serviceTier } : {}),
      },
      cached,
      status: 200,
      statusText: 'OK',
    });
  }

  it('bills the model and rates selected by prompt overrides', async () => {
    reply();
    const result = await makeProvider('minimax', { apiKey: 'fixture', inputCost: 0.01 }).callApi(
      'Hello',
      promptContext({ inputCost: 0.02, passthrough: { model: 'MiniMax-M2.7-highspeed' } }),
    );
    expect(result.cost).toBeCloseTo(60 * 0.02 + (40 * 0.06) / 1e6 + (50 * 2.4) / 1e6, 10);
  });

  it.each([{}, { passthrough: { service_tier: 'priority' } }])(
    'bills priority selected by response or request',
    async (config) => {
      reply(false, Object.keys(config).length ? undefined : 'priority');
      const result = await makeProvider('minimax', { apiKey: 'fixture', ...config }).callApi(
        'Hello',
      );
      expect(result.cost).toBeCloseTo(((60 * 0.3 + 40 * 0.06 + 50 * 1.2) * 1.5) / 1e6, 12);
    },
  );

  it('does not multiply explicit user rates by the priority tier', () => {
    expect(
      calculateMiniMaxCost(
        'MiniMax-M3',
        { service_tier: 'priority', inputCost: 0.01, outputCost: 0.02, cacheReadCost: 0.001 },
        100,
        50,
        40,
      ),
    ).toBeCloseTo(1.64);
  });

  it('applies priority to long-context fallback rates', () => {
    expect(calculateMiniMaxCost('MiniMax-M3', { service_tier: 'priority' }, 512001, 0)).toBeCloseTo(
      (512001 * 0.6 * 1.5) / 1e6,
      12,
    );
  });

  it.each([
    { prompt_tokens_details: { cached_tokens: 40 } },
    { input_tokens_details: { cached_tokens: 40 } },
    { cached_tokens: 40 },
  ])('preserves normalized cached-token billing for %j', async (cacheUsage) => {
    reply(false, undefined, cacheUsage);
    const result = await makeProvider('minimax', { apiKey: 'fixture' }).callApi('Hello');
    expect(result.tokenUsage?.completionDetails?.cacheReadInputTokens).toBe(40);
    expect(result.cost).toBeCloseTo(0.0000804, 14);
  });

  it('preserves an explicit native zero before alternate cache counters', async () => {
    reply(false, undefined, { prompt_tokens_details: { cached_tokens: 0 }, cached_tokens: 40 });
    const result = await makeProvider('minimax', { apiKey: 'fixture' }).callApi('Hello');
    expect(result.cost).toBeCloseTo(0.00009, 14);
  });

  it.each([
    [{ inputCost: 0.01, outputCost: 0.02, cacheReadCost: 0.001 }, 40, 1.64],
    [{ inputCost: 0.01, outputCost: 0.02 }, 0, 2],
    [{ inputCost: 0.01, outputCost: 0.02 }, 40, 2],
    [{ cost: 0.0001, cacheReadCost: 0 }, 40, 0.011],
    [{ inputCost: 0, outputCost: 0, cacheReadCost: 0 }, 40, 0],
  ])(
    'honors custom pricing for an unlisted effective alias',
    async (config, cachedTokens, expected) => {
      reply(false, 'priority', { input_tokens_details: { cached_tokens: cachedTokens } });
      const result = await makeProvider('minimax', { apiKey: 'fixture' }).callApi(
        'Hello',
        promptContext({ ...config, passthrough: { model: 'private-minimax-deployment' } }),
      );
      expect(result.cost).toBeCloseTo(expected, 14);
    },
  );

  it('leaves unlisted aliases without sufficient rates unpriced', () => {
    expect(
      calculateMiniMaxCost('private-deployment', { inputCost: 0.01 }, 100, 50),
    ).toBeUndefined();
  });

  it('retains zero incremental cost on a promptfoo cache hit', async () => {
    reply(true);
    expect(
      (
        await makeProvider('minimax', { apiKey: 'fixture', service_tier: 'priority' }).callApi(
          'Hello',
        )
      ).cost,
    ).toBe(0);
  });
});
