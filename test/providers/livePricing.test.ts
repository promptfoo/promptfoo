import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLivePricingForTests,
  getLiveModelCost,
  isLivePricingEnabled,
  OPENROUTER_MODELS_URL,
  refreshLivePricing,
} from '../../src/providers/livePricing';
import { calculateCost } from '../../src/providers/shared';
import { fetchWithTimeout } from '../../src/util/fetch';

vi.mock('../../src/util/fetch');

const OPENROUTER_RESPONSE = {
  data: [
    {
      id: 'openai/gpt-5.6-luna',
      pricing: { prompt: '0.0000005', completion: '0.0000015' },
    },
    {
      id: 'openai/gpt-5.6-luna:free',
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'anthropic/claude-haiku-4.5',
      pricing: { prompt: '0.000001', completion: '0.000005' },
    },
    {
      id: 'openai/gpt-4.1',
      pricing: { prompt: '0.000002', completion: '0.000008' },
    },
  ],
};

function mockSuccessfulFetch() {
  vi.mocked(fetchWithTimeout).mockImplementation(async () => {
    return new Response(JSON.stringify(OPENROUTER_RESPONSE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

describe('live pricing fallback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetLivePricingForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  describe('isLivePricingEnabled', () => {
    it('is disabled by default', () => {
      expect(isLivePricingEnabled()).toBe(false);
    });

    it('is enabled when PROMPTFOO_LIVE_PRICING is set', () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      expect(isLivePricingEnabled()).toBe(true);
    });
  });

  describe('refreshLivePricing', () => {
    it('does not fetch when the feature is disabled', async () => {
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(fetchWithTimeout).not.toHaveBeenCalled();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });

    it('fetches pricing from the OpenRouter models API when enabled', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(fetchWithTimeout).toHaveBeenCalledWith(
        OPENROUTER_MODELS_URL,
        expect.anything(),
        expect.any(Number),
      );
      expect(getLiveModelCost('gpt-5.6-luna')).toEqual({
        input: 0.0000005,
        output: 0.0000015,
      });
    });

    it('does not refetch while the cache is fresh', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();
      await refreshLivePricing();

      expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    });

    it('keeps serving a stale cache when a later refresh fails', async () => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeDefined();

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      vi.mocked(fetchWithTimeout).mockImplementation(async () => {
        throw new Error('network unreachable');
      });

      await expect(refreshLivePricing()).resolves.toBeUndefined();
      expect(getLiveModelCost('gpt-5.6-luna')).toEqual({
        input: 0.0000005,
        output: 0.0000015,
      });
    });

    it('resolves without pricing when the initial fetch fails', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      vi.mocked(fetchWithTimeout).mockImplementation(async () => {
        throw new Error('network unreachable');
      });

      await expect(refreshLivePricing()).resolves.toBeUndefined();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });

    it('resolves without pricing on a non-OK response', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      vi.mocked(fetchWithTimeout).mockImplementation(async () => {
        return new Response('rate limited', { status: 429 });
      });

      await expect(refreshLivePricing()).resolves.toBeUndefined();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });
  });

  describe('getLiveModelCost id normalization', () => {
    it('resolves promptfoo provider ids against OpenRouter model ids', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('anthropic:messages:claude-haiku-4-5-20251001')).toEqual({
        input: 0.000001,
        output: 0.000005,
      });
    });

    it('resolves dated variants with hyphenated suffixes', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('gpt-4.1-2025-04-14')).toEqual({
        input: 0.000002,
        output: 0.000008,
      });
    });

    it('never resolves the :free variant price for a paid model', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('gpt-5.6-luna')).toEqual({
        input: 0.0000005,
        output: 0.0000015,
      });
    });

    it('returns undefined for models OpenRouter does not know', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('totally-unknown-model')).toBeUndefined();
    });
  });

  describe('calculateCost integration', () => {
    it('keeps current behavior for unknown models when the feature is disabled', async () => {
      mockSuccessfulFetch();
      await refreshLivePricing();

      expect(calculateCost('gpt-5.6-luna', {}, 1000, 500, [])).toBeUndefined();
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    });

    it('resolves pricing from the live cache for unknown models when enabled', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();
      await refreshLivePricing();

      expect(calculateCost('gpt-5.6-luna', {}, 1000, 500, [])).toBeCloseTo(
        0.0000005 * 1000 + 0.0000015 * 500,
      );
    });

    it('lets manual inputCost/outputCost overrides take precedence over live pricing', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();
      await refreshLivePricing();

      const cost = calculateCost(
        'gpt-5.6-luna',
        { inputCost: 0.001, outputCost: 0.002 },
        1000,
        500,
        [],
      );

      expect(cost).toBe(0.001 * 1000 + 0.002 * 500);
    });

    it('still uses the static table for models it knows', () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      const models = [{ id: 'known-model', cost: { input: 0.000001, output: 0.000002 } }];

      expect(calculateCost('known-model', {}, 1000, 500, models)).toBe(
        0.000001 * 1000 + 0.000002 * 500,
      );
    });
  });
});
