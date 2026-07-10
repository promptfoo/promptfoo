import { describe, expect, it } from 'vitest';
import {
  calculateObservableOpenAIToolCost,
  calculateOpenAIUsageCost,
  calculateOpenAIUsageCostFromTokenUsage,
  extractOpenAIBillingUsage,
} from '../../../src/providers/openai/billing';

describe('OpenAI billing helpers', () => {
  it('extracts multimodal usage details from responses payloads', () => {
    expect(
      extractOpenAIBillingUsage({
        input_tokens: 220,
        output_tokens: 460,
        input_tokens_details: {
          text_tokens: 20,
          image_tokens: 194,
          audio_tokens: 6,
          cached_tokens: 12,
          cache_write_tokens: 5,
        },
        output_tokens_details: {
          text_tokens: 180,
          image_tokens: 272,
          audio_tokens: 8,
        },
      }),
    ).toEqual({
      totalInputTokens: 220,
      cachedInputTokens: 12,
      cacheWriteInputTokens: 5,
      cachedTextInputTokens: 0,
      cachedAudioInputTokens: 0,
      cachedImageInputTokens: 0,
      textInputTokens: 20,
      audioInputTokens: 6,
      imageInputTokens: 194,
      totalOutputTokens: 460,
      textOutputTokens: 180,
      audioOutputTokens: 8,
      imageOutputTokens: 272,
    });
  });

  it('extracts multimodal usage details from realtime payloads', () => {
    expect(
      extractOpenAIBillingUsage({
        input_tokens: 30,
        output_tokens: 23,
        input_token_details: {
          text_tokens: 21,
          audio_tokens: 9,
          cached_tokens: 4,
          cached_tokens_details: {
            text_tokens: 3,
            audio_tokens: 1,
            image_tokens: 0,
          },
        },
        output_token_details: {
          text_tokens: 16,
          audio_tokens: 7,
        },
      }),
    ).toEqual({
      totalInputTokens: 30,
      cachedInputTokens: 4,
      cacheWriteInputTokens: 0,
      cachedTextInputTokens: 3,
      cachedAudioInputTokens: 1,
      cachedImageInputTokens: 0,
      textInputTokens: 21,
      audioInputTokens: 9,
      imageInputTokens: 0,
      totalOutputTokens: 23,
      textOutputTokens: 16,
      audioOutputTokens: 7,
      imageOutputTokens: 0,
    });
  });

  it('applies provider-side cached-input discounts to standard text usage', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-5-mini',
      {},
      {
        prompt_tokens: 1_000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 400 },
      },
      {},
    );

    expect(cost).toBeCloseTo((600 * 0.25 + 400 * 0.025 + 100 * 2) / 1e6, 10);
  });

  it('prices cached input for GPT-5.3 coding models', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-5.3-codex',
        {},
        {
          prompt_tokens: 2_000,
          completion_tokens: 1_000,
          prompt_tokens_details: { cached_tokens: 500 },
        },
      ),
    ).toBeCloseTo((1_500 * 1.75 + 500 * 0.175 + 1_000 * 14) / 1e6, 10);

    expect(
      calculateOpenAIUsageCost(
        'gpt-5.3-codex-spark',
        {},
        {
          prompt_tokens: 2_000,
          completion_tokens: 1_000,
          prompt_tokens_details: { cached_tokens: 500 },
        },
      ),
    ).toBeCloseTo((1_500 * 0.5 + 500 * 0.05 + 1_000 * 4) / 1e6, 10);
  });

  it.each([
    ['gpt-5.6', 5, 0.5, 30],
    ['gpt-5.6-sol', 5, 0.5, 30],
    ['gpt-5.6-terra', 2.5, 0.25, 15],
    ['gpt-5.6-luna', 1, 0.1, 6],
  ])('prices %s cached input at the published 90%% discount', (model, inputRate, cachedRate, outputRate) => {
    const usage = {
      prompt_tokens: 2_000,
      completion_tokens: 1_000,
      prompt_tokens_details: { cached_tokens: 500 },
    };

    expect(calculateOpenAIUsageCost(model, {}, usage)).toBeCloseTo(
      (1_500 * inputRate + 500 * cachedRate + 1_000 * outputRate) / 1e6,
      10,
    );
  });

  it('prices GPT-5.6 explicit cache writes at 1.25x input', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-5.6',
        {},
        {
          input_tokens: 2_000,
          output_tokens: 1_000,
          input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
        },
      ),
    ).toBeCloseTo((1_250 * 5 + 500 * 0.5 + 250 * 6.25 + 1_000 * 30) / 1e6, 10);
  });

  it.each([
    [{ apiHost: 'eu.api.openai.com' }, {}],
    [{ apiBaseUrl: 'https://us.api.openai.com/v1' }, {}],
    [{}, { apiUrl: 'https://eu.api.openai.com/v1' }],
  ])('applies the GPT-5.6 regional processing uplift', (config, options) => {
    const usage = {
      input_tokens: 2_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
    };

    expect(calculateOpenAIUsageCost('gpt-5.6', config, usage, options)).toBeCloseTo(
      ((1_250 * 5 + 500 * 0.5 + 250 * 6.25 + 1_000 * 30) / 1e6) * 1.1,
      10,
    );
  });

  it('preserves GPT-5.6 custom costs while uplifting remaining regional rates', () => {
    const usage = {
      input_tokens: 2_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
    };

    expect(
      calculateOpenAIUsageCost(
        'gpt-5.6',
        {
          apiHost: 'eu.api.openai.com',
          inputCost: 2 / 1e6,
        },
        usage,
      ),
    ).toBeCloseTo((2_000 * 2 + 1_000 * 30 * 1.1) / 1e6, 10);
  });

  it.each([
    'proxy.api.openai.com',
    'au.api.openai.com',
  ])('does not apply the GPT-5.6 regional uplift to %s', (apiHost) => {
    const usage = {
      input_tokens: 2_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 500, cache_write_tokens: 250 },
    };

    expect(calculateOpenAIUsageCost('gpt-5.6', { apiHost }, usage)).toBeCloseTo(
      (1_250 * 5 + 500 * 0.5 + 250 * 6.25 + 1_000 * 30) / 1e6,
      10,
    );
  });

  it('omits GPT-5.6 cost when summarized usage lacks cache-write tokens', () => {
    expect(
      calculateOpenAIUsageCostFromTokenUsage('gpt-5.6-sol', {
        prompt: 2_000,
        completion: 1_000,
        cached: 500,
      }),
    ).toBeUndefined();
  });

  it('prices GPT-5.6 summarized usage when cache-write tokens are known', () => {
    expect(
      calculateOpenAIUsageCostFromTokenUsage('gpt-5.6-sol', {
        prompt: 2_000,
        completion: 1_000,
        cached: 500,
        completionDetails: { cacheCreationInputTokens: 250 },
      }),
    ).toBeCloseTo((1_250 * 5 + 500 * 0.5 + 250 * 6.25 + 1_000 * 30) / 1e6, 10);
  });

  it('uses GPT-5.6 Flex long-context rates and rejects unsupported Priority long context', () => {
    const usage = {
      input_tokens: 300_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 100_000, cache_write_tokens: 50_000 },
    };

    expect(calculateOpenAIUsageCost('gpt-5.6-terra', {}, usage)).toBeCloseTo(
      (150_000 * 5 + 100_000 * 0.5 + 50_000 * 6.25 + 1_000 * 22.5) / 1e6,
      10,
    );
    expect(
      calculateOpenAIUsageCost('gpt-5.6-terra', {}, usage, { serviceTier: 'flex' }),
    ).toBeCloseTo((150_000 * 2.5 + 100_000 * 0.25 + 50_000 * 3.125 + 1_000 * 11.25) / 1e6, 10);
    expect(
      calculateOpenAIUsageCost('gpt-5.6-terra', {}, usage, { serviceTier: 'priority' }),
    ).toBeUndefined();
  });

  it('uses GPT-5.6 Priority rates through the 272K input limit', () => {
    const usage = {
      input_tokens: 272_000,
      output_tokens: 1_000,
      input_tokens_details: { cached_tokens: 100_000, cache_write_tokens: 50_000 },
    };

    expect(
      calculateOpenAIUsageCost('gpt-5.6-terra', {}, usage, { serviceTier: 'priority' }),
    ).toBeCloseTo((122_000 * 5 + 100_000 * 0.5 + 50_000 * 6.25 + 1_000 * 30) / 1e6, 10);
    expect(
      calculateOpenAIUsageCost(
        'gpt-5.6-terra',
        {},
        { ...usage, input_tokens: 272_001 },
        { serviceTier: 'priority' },
      ),
    ).toBeUndefined();
  });

  it('prices chat-latest cached input at the published discount', () => {
    expect(
      calculateOpenAIUsageCost(
        'chat-latest',
        {},
        {
          prompt_tokens: 2_000,
          completion_tokens: 1_000,
          prompt_tokens_details: { cached_tokens: 500 },
        },
      ),
    ).toBeCloseTo((1_500 * 5 + 500 * 0.5 + 1_000 * 30) / 1e6, 10);
  });

  it('uses returned service tiers when pricing flex and priority work', () => {
    const usage = {
      input_tokens: 1_000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 400 },
    };

    expect(calculateOpenAIUsageCost('gpt-5-mini', {}, usage, { serviceTier: 'flex' })).toBeCloseTo(
      (600 * 0.125 + 400 * 0.0125 + 100 * 1) / 1e6,
      10,
    );
    expect(
      calculateOpenAIUsageCost('gpt-5-mini', {}, usage, { serviceTier: 'priority' }),
    ).toBeCloseTo((600 * 0.45 + 400 * 0.045 + 100 * 3.6) / 1e6, 10);
  });

  it('uses current long-context flex rates for supported pro models', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-5.5-pro',
        {},
        {
          input_tokens: 300_000,
          output_tokens: 1_000,
        },
        { serviceTier: 'flex' },
      ),
    ).toBeCloseTo((300_000 * 30 + 1_000 * 135) / 1e6, 10);
  });

  it('does not invent flex pricing for unsupported models', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-4.1',
        {},
        {
          input_tokens: 1_000,
          output_tokens: 100,
        },
        { serviceTier: 'flex' },
      ),
    ).toBeUndefined();
  });

  it('applies the Batch API discount to standard rates', () => {
    const usage = {
      input_tokens: 1_000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 400 },
    };

    expect(calculateOpenAIUsageCost('gpt-5-mini', {}, usage, { serviceTier: 'batch' })).toBeCloseTo(
      (600 * 0.125 + 400 * 0.0125 + 100 * 1) / 1e6,
      10,
    );
    expect(
      calculateOpenAIUsageCost(
        'text-embedding-3-large',
        {},
        { prompt_tokens: 10, total_tokens: 10 },
        { serviceTier: 'batch' },
      ),
    ).toBeCloseTo((10 * 0.065) / 1e6, 12);
  });

  it('keeps cached responses for unknown models unpriced', () => {
    expect(
      calculateOpenAIUsageCost(
        'third-party/model',
        {},
        {
          prompt_tokens: 10,
          completion_tokens: 5,
        },
        { cachedResponse: true },
      ),
    ).toBeUndefined();
  });

  it('prices audio text and audio tokens separately', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-4o-mini-audio-preview',
      {},
      {
        prompt_tokens: 30,
        completion_tokens: 23,
        prompt_tokens_details: {
          text_tokens: 21,
          audio_tokens: 9,
        },
        completion_tokens_details: {
          text_tokens: 16,
          audio_tokens: 7,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo((21 * 0.15 + 9 * 10 + 16 * 0.6 + 7 * 20) / 1e6, 10);
  });

  it('uses current gpt-realtime-mini multimodal and cached rates', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-realtime-mini',
      {},
      {
        input_tokens: 1_030,
        output_tokens: 30,
        input_tokens_details: {
          text_tokens: 1_000,
          audio_tokens: 20,
          image_tokens: 10,
          cached_tokens: 100,
        },
        output_tokens_details: {
          text_tokens: 20,
          audio_tokens: 10,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo(
      (900 * 0.6 + 100 * 0.06 + 20 * 10 + 10 * 0.8 + 20 * 2.4 + 10 * 20) / 1e6,
      10,
    );
  });

  it('uses current gpt-realtime-2 multimodal and cached rates', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-realtime-2',
      {},
      {
        input_tokens: 1_030,
        output_tokens: 30,
        input_tokens_details: {
          text_tokens: 1_000,
          audio_tokens: 20,
          image_tokens: 10,
          cached_tokens: 100,
        },
        output_tokens_details: {
          text_tokens: 20,
          audio_tokens: 10,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo(
      (900 * 4 + 100 * 0.4 + 20 * 32 + 10 * 5 + 20 * 24 + 10 * 64) / 1e6,
      10,
    );
  });

  it('uses explicit cached modality splits when realtime payloads provide them', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-realtime-mini',
      {},
      {
        input_tokens: 1_030,
        output_tokens: 30,
        input_token_details: {
          text_tokens: 1_000,
          audio_tokens: 20,
          image_tokens: 10,
          cached_tokens: 100,
          cached_tokens_details: {
            text_tokens: 70,
            audio_tokens: 20,
            image_tokens: 10,
          },
        },
        output_token_details: {
          text_tokens: 20,
          audio_tokens: 10,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo(
      (930 * 0.6 + 70 * 0.06 + 20 * 0.3 + 10 * 0.08 + 20 * 2.4 + 10 * 20) / 1e6,
      10,
    );
  });

  it('uses realtime singular usage detail keys when pricing', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-realtime-mini',
      {},
      {
        input_tokens: 30,
        output_tokens: 23,
        input_token_details: {
          text_tokens: 21,
          audio_tokens: 9,
        },
        output_token_details: {
          text_tokens: 16,
          audio_tokens: 7,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo((21 * 0.6 + 9 * 10 + 16 * 2.4 + 7 * 20) / 1e6, 10);
  });

  it('prices GPT Image usage from the returned token ledger', () => {
    const cost = calculateOpenAIUsageCost(
      'gpt-image-1.5',
      {},
      {
        input_tokens: 222,
        output_tokens: 453,
        input_tokens_details: {
          text_tokens: 28,
          image_tokens: 194,
        },
        output_tokens_details: {
          text_tokens: 181,
          image_tokens: 272,
        },
      },
      {},
    );

    expect(cost).toBeCloseTo((28 * 5 + 194 * 8 + 181 * 10 + 272 * 32) / 1e6, 10);
  });

  it('does not claim exact GPT Image 1.5 cost without an output-token breakdown', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-image-1.5',
        {},
        {
          input_tokens: 222,
          output_tokens: 453,
          input_tokens_details: {
            text_tokens: 28,
            image_tokens: 194,
          },
        },
        {},
      ),
    ).toBeUndefined();
  });

  it('prices embeddings from prompt tokens', () => {
    expect(
      calculateOpenAIUsageCost(
        'text-embedding-3-large',
        {},
        {
          prompt_tokens: 10,
          total_tokens: 10,
        },
        {},
      ),
    ).toBeCloseTo((10 * 0.13) / 1e6, 12);
  });

  it('does not bill promptfoo cache hits again', () => {
    expect(
      calculateOpenAIUsageCost(
        'gpt-5-mini',
        {},
        {
          prompt_tokens: 1_000,
          completion_tokens: 100,
        },
        { cachedResponse: true },
      ),
    ).toBe(0);
  });

  it('adds observable call-based tool fees', () => {
    expect(
      calculateObservableOpenAIToolCost(
        {
          output: [
            { type: 'web_search_call', action: { type: 'search' } },
            { type: 'web_search_call', action: { type: 'search' } },
            { type: 'file_search_call' },
          ],
        },
        'gpt-5-mini',
        { tools: [{ type: 'web_search_preview' }] },
      ),
    ).toBeCloseTo(0.0225, 10);
    expect(
      calculateObservableOpenAIToolCost(
        {
          output: [{ type: 'web_search_call', action: { type: 'search' } }],
        },
        'gpt-4o',
        { tools: [{ type: 'web_search_preview' }] },
      ),
    ).toBeCloseTo(0.025, 10);
  });

  it('uses non-preview web search pricing when configured', () => {
    expect(
      calculateObservableOpenAIToolCost(
        {
          output: [{ type: 'web_search_call', action: { type: 'search' } }],
        },
        'gpt-4o',
        { tools: [{ type: 'web_search' }] },
      ),
    ).toBeCloseTo(0.01, 10);
  });

  it('does not charge non-search web actions', () => {
    expect(
      calculateObservableOpenAIToolCost(
        {
          output: [
            { type: 'web_search_call', action: { type: 'open_page' } },
            { type: 'web_search_call', action: { type: 'find_in_page' } },
          ],
        },
        'o3',
        { tools: [{ type: 'web_search_preview' }] },
      ),
    ).toBe(0);
  });
});
