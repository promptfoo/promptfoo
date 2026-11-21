import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLivePricingForTests,
  getLiveModelCost,
  isLivePricingEnabled,
  OPENROUTER_MODELS_URL,
  refreshLivePricing,
} from '../../src/providers/livePricing';
import { calculateCost } from '../../src/providers/shared';
import { fetchWithProxy } from '../../src/util/fetch';

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
  vi.mocked(fetchWithProxy).mockImplementation(async () => {
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

      expect(fetchWithProxy).not.toHaveBeenCalled();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });

    it('fetches pricing from the OpenRouter models API when enabled', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(fetchWithProxy).toHaveBeenCalledWith(
        OPENROUTER_MODELS_URL,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

      expect(fetchWithProxy).toHaveBeenCalledTimes(1);
    });

    it('keeps serving a stale cache when a later refresh fails', async () => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeDefined();

      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      vi.mocked(fetchWithProxy).mockImplementation(async () => {
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
      vi.mocked(fetchWithProxy).mockImplementation(async () => {
        throw new Error('network unreachable');
      });

      await expect(refreshLivePricing()).resolves.toBeUndefined();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });

    it('resolves without pricing on a non-OK response', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      vi.mocked(fetchWithProxy).mockImplementation(async () => {
        return new Response('rate limited', { status: 429 });
      });

      await expect(refreshLivePricing()).resolves.toBeUndefined();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeUndefined();
    });
  });

  describe('getLiveModelCost id normalization', () => {
    it('does not guess a differently formatted snapshot or provider path', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('anthropic:messages:claude-haiku-4-5-20251001')).toBeUndefined();
      expect(getLiveModelCost('anthropic/claude-haiku-4.5')).toEqual({
        input: 0.000001,
        output: 0.000005,
      });
    });

    it('does not substitute current prices for an unknown dated snapshot', async () => {
      vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true');
      mockSuccessfulFetch();

      await refreshLivePricing();

      expect(getLiveModelCost('gpt-4.1-2025-04-14')).toBeUndefined();
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
      expect(fetchWithProxy).not.toHaveBeenCalled();
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
  describe('catalog integrity and refresh lifecycle', () => {
    beforeEach(() => vi.stubEnv('PROMPTFOO_LIVE_PRICING', 'true'));

    it('keeps snapshots and vendors distinct and omits ambiguous short names', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: 'alpha/model', pricing: { prompt: '1', completion: '2' } },
              { id: 'beta/model', pricing: { prompt: '3', completion: '4' } },
              { id: 'alpha/model-20250101', pricing: { prompt: '5', completion: '6' } },
              { id: 'alpha/model-1', pricing: { prompt: '7', completion: '8' } },
              { id: 'alpha/model.1', pricing: { prompt: '9', completion: '10' } },
            ],
          }),
        ),
      );
      await refreshLivePricing();
      expect(getLiveModelCost('model')).toBeUndefined();
      expect(getLiveModelCost('alpha/model')?.input).toBe(1);
      expect(getLiveModelCost('beta/model')?.input).toBe(3);
      expect(getLiveModelCost('model-20250101')?.input).toBe(5);
      expect(getLiveModelCost('model-1')?.input).toBe(7);
      expect(getLiveModelCost('model.1')?.input).toBe(9);
    });

    it('skips malformed entries and never converts null, blank or negative rates to prices', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              null,
              { id: 'ok', pricing: { prompt: '0', completion: '0' } },
              ...[null, '', -1, 'NaN'].map((prompt, i) => ({
                id: `bad-${i}`,
                pricing: { prompt, completion: '1' },
              })),
            ],
          }),
        ),
      );
      await refreshLivePricing();
      expect(getLiveModelCost('ok')).toEqual({ input: 0, output: 0 });
      for (let i = 0; i < 4; i++) {
        expect(getLiveModelCost(`bad-${i}`)).toBeUndefined();
      }
    });

    it.each([
      {},
      { data: [] },
      { data: [{ id: 'bad', pricing: { prompt: null, completion: null } }] },
    ])('retains stale prices for unusable 200 responses: %j', async (body) => {
      vi.useFakeTimers();
      mockSuccessfulFetch();
      await refreshLivePricing();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      vi.mocked(fetchWithProxy).mockResolvedValue(new Response(JSON.stringify(body)));
      await refreshLivePricing();
      expect(getLiveModelCost('gpt-5.6-luna')).toBeDefined();
    });

    it('shares concurrent refreshes and cancels one waiting evaluation independently', async () => {
      let release!: (response: Response) => void;
      vi.mocked(fetchWithProxy).mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const controller = new AbortController();
      const first = refreshLivePricing(controller.signal);
      const second = refreshLivePricing();
      await vi.waitFor(() => expect(fetchWithProxy).toHaveBeenCalledTimes(1));
      const reason = new Error('evaluation cancelled');
      const rejected = expect(first).rejects.toBe(reason);
      controller.abort(reason);
      await rejected;
      release(new Response(JSON.stringify(OPENROUTER_RESPONSE)));
      await second;
      expect(getLiveModelCost('gpt-5.6-luna')).toBeDefined();
    });

    it('times out a stalled response body and keeps stale pricing', async () => {
      vi.useFakeTimers();
      mockSuccessfulFetch();
      await refreshLivePricing();
      vi.advanceTimersByTime(25 * 60 * 60 * 1000);
      vi.mocked(fetchWithProxy).mockImplementation(
        async (_url, options) =>
          new Response(
            new ReadableStream({
              start(controller) {
                options?.signal?.addEventListener(
                  'abort',
                  () => controller.error(options.signal?.reason),
                  { once: true },
                );
              },
            }),
          ),
      );
      const pending = refreshLivePricing();
      await vi.advanceTimersByTimeAsync(10_001);
      await pending;
      expect(getLiveModelCost('gpt-5.6-luna')).toBeDefined();
    });
  });
});
