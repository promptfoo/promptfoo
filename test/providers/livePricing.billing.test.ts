import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateAnthropicCost } from '../../src/providers/anthropic/util';
import { calculateGoogleCostFromUsage } from '../../src/providers/google/util';
import { __resetLivePricingForTests, refreshLivePricing } from '../../src/providers/livePricing';
import { calculateOpenAIUsageCost } from '../../src/providers/openai/billing';
import { fetchWithProxy } from '../../src/util/fetch';

vi.mock('../../src/util/fetch');

beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
  __resetLivePricingForTests();
  vi.mocked(fetchWithProxy).mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'openai/fixture-new-chat',
            pricing: {
              prompt: '0.001',
              completion: '0.002',
              input_cache_read: '0.0001',
              input_cache_write: '0.00125',
            },
          },
          {
            id: 'anthropic/fixture-new-claude',
            pricing: {
              prompt: '0.001',
              completion: '0.002',
              input_cache_read: '0.0001',
              input_cache_write: '0.00125',
            },
          },
          {
            id: 'google/fixture-new-gemini',
            pricing: { prompt: '0.001', completion: '0.002', input_cache_read: '0.0001' },
          },
          { id: 'openai/fixture-no-cache-rate', pricing: { prompt: '0.001', completion: '0.002' } },
        ],
      }),
    ),
  );
  await refreshLivePricing();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetLivePricingForTests();
});

describe('live estimates through provider billing paths', () => {
  it('prices OpenAI ordinary, read, write, and output tokens separately', () => {
    const usage = {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
    };
    expect(calculateOpenAIUsageCost('fixture-new-chat', {}, usage)).toBeCloseTo(
      0.7 + 0.02 + 0.125 + 0.2,
    );
    expect(calculateOpenAIUsageCost('fixture-new-chat', {}, usage, { cachedResponse: true })).toBe(
      0,
    );
    expect(
      calculateOpenAIUsageCost('fixture-new-chat', { inputCost: 0.003, outputCost: 0.004 }, usage),
    ).toBeCloseTo(3.4);
    expect(
      calculateOpenAIUsageCost('fixture-new-chat', {}, usage, { serviceTier: 'flex' }),
    ).toBeUndefined();
    expect(calculateOpenAIUsageCost('fixture-no-cache-rate', {}, usage)).toBeUndefined();
  });
  it('includes Anthropic cache tokens that are outside ordinary input_tokens', () => {
    expect(calculateAnthropicCost('fixture-new-claude', {}, 700, 100, 200, 100)).toBeCloseTo(
      0.7 + 0.02 + 0.125 + 0.2,
    );
    expect(
      calculateAnthropicCost('fixture-new-claude', {}, 700, 100, 200, 100, 50),
    ).toBeUndefined();
    expect(
      calculateAnthropicCost('fixture-new-claude', { inputCost: 0.003 }, 700, 100, 200, 100),
    ).toBeCloseTo(3.2);
    expect(
      calculateAnthropicCost('fixture-new-claude', { cost: 0.003 }, 700, 100, 200, 100, 50),
    ).toBeCloseTo(3.3);
    expect(
      calculateAnthropicCost('fixture-new-claude', { speed: 'fast' }, 700, 100),
    ).toBeUndefined();
  });
  it('prices uncached and cached Google input separately through usage parsing', () => {
    expect(
      calculateGoogleCostFromUsage('fixture-new-gemini', {}, 1000, 100, false, {
        cachedContentTokenCount: 200,
      }),
    ).toBeCloseTo(0.8 + 0.02 + 0.2);
    expect(
      calculateGoogleCostFromUsage('fixture-new-gemini', {}, 1000, 100, true, {}),
    ).toBeUndefined();
    expect(
      calculateGoogleCostFromUsage('fixture-new-gemini', {}, 1000, 100, false, {}, 'priority'),
    ).toBeUndefined();
    expect(
      calculateGoogleCostFromUsage('fixture-new-gemini', {}, 1000, 100, false, {
        promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 10 }],
      }),
    ).toBeUndefined();
  });
  it('does not price any unknown provider model when the opt-in is disabled', () => {
    vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'false');
    expect(
      calculateOpenAIUsageCost('fixture-new-chat', {}, { prompt_tokens: 1, completion_tokens: 1 }),
    ).toBeUndefined();
    expect(calculateAnthropicCost('fixture-new-claude', {}, 1, 1)).toBeUndefined();
    expect(calculateGoogleCostFromUsage('fixture-new-gemini', {}, 1, 1, false, {})).toBeUndefined();
  });
});
