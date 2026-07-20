import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateOpenAICost,
  calculateSafeOpenAICost,
  failApiCall,
  formatOpenAiError,
  getChatCompletionRefusal,
  getTokenUsage,
  getTokenUsageWithRequestCount,
  OPENAI_CHAT_MODELS,
  OPENAI_REALTIME_MODELS,
  OPENAI_RESPONSES_ONLY_MODELS,
  validateChatCompletionMessage,
  validateFunctionCall,
} from '../../../src/providers/openai/util';

vi.mock('../../../src/cache');

describe('failApiCall', () => {
  it('should format OpenAI API errors', () => {
    const error = new OpenAI.APIError(400, {}, 'Bad request', new Headers());
    Object.defineProperty(error, 'type', {
      value: 'invalid_request_error',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(error, 'message', {
      value: 'Bad request',
      writable: true,
      configurable: true,
    });
    Object.defineProperty(error, 'status', {
      value: 400,
      writable: true,
      configurable: true,
    });

    const result = failApiCall(error);
    expect(result).toEqual({
      error: `API error: invalid_request_error 400 Bad request`,
    });
  });

  it('should format generic errors', () => {
    const error = new Error('Network error');
    const result = failApiCall(error);
    expect(result).toEqual({
      error: `API error: Error: Network error`,
    });
  });
});

describe('getTokenUsage', () => {
  it('should return token usage for non-cached response', () => {
    const data = {
      usage: {
        total_tokens: 100,
        prompt_tokens: 40,
        completion_tokens: 60,
      },
    };

    const result = getTokenUsage(data, false);
    expect(result).toEqual({
      total: 100,
      prompt: 40,
      completion: 60,
      numRequests: 1,
    });
  });

  it('should return cached token usage', () => {
    const data = {
      usage: {
        total_tokens: 100,
      },
    };

    const result = getTokenUsage(data, true);
    // Cached responses don't count as a new request
    expect(result).toEqual({
      cached: 100,
      total: 100,
    });
  });

  it('should handle missing usage data', () => {
    const data = {};
    const result = getTokenUsage(data, false);
    expect(result).toEqual({});
  });

  it('should handle completion tokens details', () => {
    const data = {
      usage: {
        total_tokens: 100,
        prompt_tokens: 40,
        completion_tokens: 60,
        completion_tokens_details: {
          reasoning_tokens: 20,
          accepted_prediction_tokens: 30,
          rejected_prediction_tokens: 10,
        },
      },
    };

    const result = getTokenUsage(data, false);
    expect(result).toEqual({
      total: 100,
      prompt: 40,
      completion: 60,
      numRequests: 1,
      completionDetails: {
        reasoning: 20,
        acceptedPrediction: 30,
        rejectedPrediction: 10,
      },
    });
  });

  it('should read completion details from output_tokens_details for Responses-style usage', () => {
    const data = {
      usage: {
        total_tokens: 45,
        prompt_tokens: 15,
        completion_tokens: 30,
        output_tokens_details: {
          reasoning_tokens: 100,
        },
      },
    };

    const result = getTokenUsage(data, false);
    expect(result).toEqual({
      total: 45,
      prompt: 15,
      completion: 30,
      numRequests: 1,
      completionDetails: {
        reasoning: 100,
      },
    });
  });

  it('should prefer completion_tokens_details over output_tokens_details', () => {
    const data = {
      usage: {
        total_tokens: 45,
        prompt_tokens: 15,
        completion_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 7 },
        output_tokens_details: { reasoning_tokens: 100 },
      },
    };

    expect(getTokenUsage(data, false).completionDetails).toEqual({ reasoning: 7 });
  });

  it('should preserve provider-side cache read and write tokens', () => {
    const data = {
      usage: {
        total_tokens: 100,
        prompt_tokens: 40,
        completion_tokens: 60,
        prompt_tokens_details: {
          cached_tokens: 32,
          cache_write_tokens: 4,
        },
      },
    };

    const result = getTokenUsage(data, false);
    expect(result).toEqual({
      total: 100,
      prompt: 40,
      completion: 60,
      numRequests: 1,
      completionDetails: {
        cacheReadInputTokens: 32,
        cacheCreationInputTokens: 4,
      },
    });
  });

  it('drops malformed usage fields while preserving valid fields', () => {
    expect(
      getTokenUsage(
        {
          usage: {
            total_tokens: Number.MAX_VALUE,
            prompt_tokens: -1,
            completion_tokens: 2,
            completion_tokens_details: {
              reasoning_tokens: 'private',
              accepted_prediction_tokens: 1,
            },
          },
        },
        false,
      ),
    ).toEqual({
      prompt: 0,
      completion: 2,
      numRequests: 1,
      completionDetails: { acceptedPrediction: 1 },
    });
  });

  it('bounds adversarial nested usage without coercion', () => {
    let cachedTokens: unknown = 1;
    for (let i = 0; i < 5_000; i++) {
      cachedTokens = [cachedTokens];
    }

    expect(
      getTokenUsage({ usage: { prompt_tokens_details: { cached_tokens: cachedTokens } } }, false),
    ).toEqual({ prompt: 0, completion: 0, numRequests: 1 });
  });

  it.each([
    ['top-level positive', { cache_write_input_tokens: 4 }, 4],
    ['nested explicit zero', { prompt_tokens_details: { cache_write_tokens: 0 } }, 0],
  ])('should preserve %s cache-write usage', (_name, usageDetails, expected) => {
    const result = getTokenUsage(
      {
        usage: {
          total_tokens: 100,
          prompt_tokens: 40,
          completion_tokens: 60,
          ...usageDetails,
        },
      },
      false,
    );

    expect(result.completionDetails).toEqual({
      cacheCreationInputTokens: expected,
    });
  });
});

describe('getTokenUsageWithRequestCount', () => {
  it('preserves valid usage and explicit fresh request accounting', () => {
    expect(
      getTokenUsageWithRequestCount(
        {
          usage: {
            total_tokens: 100,
            prompt_tokens: 40,
            completion_tokens: 60,
          },
        },
        false,
      ),
    ).toEqual({
      total: 100,
      prompt: 40,
      completion: 60,
      numRequests: 1,
    });
  });

  it('does not count a cached error as a new request', () => {
    expect(getTokenUsageWithRequestCount({}, true)).toEqual({ numRequests: 0 });
  });

  it('drops malformed usage fields without losing request accounting', () => {
    expect(
      getTokenUsageWithRequestCount(
        {
          usage: {
            total_tokens: { private: 'must-not-appear' },
            prompt_tokens: { private: 'must-not-appear' },
            completion_tokens: { private: 'must-not-appear' },
          },
        },
        false,
      ),
    ).toEqual({ prompt: 0, completion: 0, numRequests: 1 });
  });

  it('drops negative and unsafe token counts while preserving valid fields', () => {
    expect(
      getTokenUsageWithRequestCount(
        {
          usage: {
            total_tokens: Number.MAX_VALUE,
            prompt_tokens: -1,
            completion_tokens: 2,
          },
        },
        false,
      ),
    ).toEqual({ prompt: 0, completion: 2, numRequests: 1 });
  });

  it('bounds coercion failures from adversarial nested usage', () => {
    let cachedTokens: unknown = 1;
    for (let i = 0; i < 5_000; i++) {
      cachedTokens = [cachedTokens];
    }

    const result = getTokenUsageWithRequestCount(
      { usage: { prompt_tokens_details: { cached_tokens: cachedTokens } } },
      false,
    );

    expect(result).toEqual({ prompt: 0, completion: 0, numRequests: 1 });
  });
});

describe('calculateSafeOpenAICost', () => {
  const config = { inputCost: 0.001, outputCost: 0.002 };

  it('preserves cost for valid usage', () => {
    expect(
      calculateSafeOpenAICost('gpt-4o', config, {
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }),
    ).toBe(0.007);
  });

  it('prefers a safe provider-reported cost without local overrides', () => {
    expect(
      calculateSafeOpenAICost(
        'openai/gpt-4o',
        {},
        {
          usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.0042 },
        },
      ),
    ).toBe(0.0042);
  });

  it('prefers explicit local cost overrides over provider-reported cost', () => {
    expect(
      calculateSafeOpenAICost('gpt-4o', config, {
        usage: { prompt_tokens: 3, completion_tokens: 2, cost: 99 },
      }),
    ).toBe(0.007);
  });

  it('applies complete local overrides to vendor-qualified model IDs', () => {
    expect(
      calculateSafeOpenAICost('openai/gpt-4o', config, {
        usage: { prompt_tokens: 3, completion_tokens: 2, cost: 99 },
      }),
    ).toBe(0.007);
  });

  it('does not fall back to provider cost when local overrides cannot be safely calculated', () => {
    expect(
      calculateSafeOpenAICost('openai/gpt-4o', config, {
        usage: { prompt_tokens: -1, completion_tokens: 2, cost: 99 },
      }),
    ).toBeUndefined();
  });

  it.each([
    ['negative counts', { prompt_tokens: -2, completion_tokens: -1 }],
    ['unsafe counts', { prompt_tokens: 1e308, completion_tokens: 1e308 }],
    ['mixed-type counts', { prompt_tokens: 3, completion_tokens: '2' }],
  ])('omits cost for %s', (_description, usage) => {
    expect(calculateSafeOpenAICost('gpt-4o', config, { usage })).toBeUndefined();
  });

  it.each([-1, Number.POSITIVE_INFINITY, '0.01'])('rejects unsafe reported cost %s', (cost) => {
    expect(
      calculateSafeOpenAICost('openai/unknown-model', {}, { usage: { cost } }),
    ).toBeUndefined();
  });
});

describe('validateChatCompletionMessage', () => {
  it('accepts a complete custom tool call', () => {
    const toolCall = {
      id: 'call_custom',
      type: 'custom',
      custom: { name: 'shell', input: 'echo hello' },
    };

    expect(validateChatCompletionMessage({ tool_calls: [toolCall] })?.toolCalls).toEqual([
      toolCall,
    ]);
  });

  it('requires a usable payload', () => {
    expect(validateChatCompletionMessage({ content: null })).toBeUndefined();
    expect(validateChatCompletionMessage({ content: '' })).toBeUndefined();
    expect(validateChatCompletionMessage({ content: [] }, { allowStructuredContent: true })).toBe(
      undefined,
    );
  });

  it('validates required fields for structured content parts', () => {
    expect(
      validateChatCompletionMessage(
        { content: [{ type: 'text' }] },
        { allowStructuredContent: true },
      ),
    ).toBeUndefined();
    expect(
      validateChatCompletionMessage(
        { content: [{ type: 'text', text: 'Hello' }] },
        { allowStructuredContent: true },
      )?.structuredContent,
    ).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('normalizes refusals and content-filter responses', () => {
    const refusalMessage = validateChatCompletionMessage({ refusal: 'Cannot comply' });
    const filteredMessage = validateChatCompletionMessage(
      { content: null },
      { finishReason: 'content_filter' },
    );

    expect(getChatCompletionRefusal(refusalMessage!, 'stop')).toEqual({
      output: 'Cannot comply',
      isRefusal: true,
      guardrails: { flagged: true },
    });
    expect(getChatCompletionRefusal(filteredMessage!, 'content_filter')).toEqual({
      output: 'Content filtered by provider',
      isRefusal: true,
      guardrails: { flagged: true },
    });
  });
});

describe('calculateOpenAICost', () => {
  it('should calculate cost correctly for TTS model gpt-4o-mini-tts', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-tts', {}, 1000, 0, 0, 500);
    expect(cost).toBeCloseTo((1000 * 0.6 + 500 * 12) / 1e6, 6);
  });

  it('should calculate cost correctly for TTS model gpt-4o-mini-tts-2025-12-15', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-tts-2025-12-15', {}, 1000, 0, 0, 500);
    expect(cost).toBeCloseTo((1000 * 0.6 + 500 * 12) / 1e6, 6);
  });

  it('should calculate cost correctly for search preview model gpt-4o-search-preview', () => {
    const cost = calculateOpenAICost('gpt-4o-search-preview', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for search preview model gpt-4o-search-preview-2025-03-11', () => {
    const cost = calculateOpenAICost('gpt-4o-search-preview-2025-03-11', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for mini search preview model gpt-4o-mini-search-preview', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-search-preview', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.15 + 500 * 0.6) / 1e6, 6);
  });

  it('should calculate cost correctly for computer use model computer-use-preview', () => {
    const cost = calculateOpenAICost('computer-use-preview', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 3 + 500 * 12) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4-1106-vision-preview', () => {
    const cost = calculateOpenAICost('gpt-4-1106-vision-preview', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 10 + 500 * 30) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4o-realtime-preview-2024-10-01', () => {
    const cost = calculateOpenAICost('gpt-4o-realtime-preview-2024-10-01', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 5 + 500 * 20) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4o-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost('gpt-4o-realtime-preview-2024-12-17', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 5 + 500 * 20) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4o-mini-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-realtime-preview-2024-12-17', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.6 + 500 * 2.4) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-realtime', () => {
    const cost = calculateOpenAICost('gpt-realtime', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 4 + 500 * 16) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-realtime-1.5', () => {
    const cost = calculateOpenAICost('gpt-realtime-1.5', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 4 + 500 * 16) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-realtime-2025-08-28', () => {
    const cost = calculateOpenAICost('gpt-realtime-2025-08-28', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 4 + 500 * 16) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-realtime-2', () => {
    const cost = calculateOpenAICost('gpt-realtime-2', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 4 + 500 * 24) / 1e6, 6);
  });

  it('should calculate cost correctly with audio tokens', () => {
    const cost = calculateOpenAICost('gpt-4o-audio-preview', {}, 1000, 500, 200, 100);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10 + 200 * 40 + 100 * 80) / 1e6, 6);
  });

  it('should calculate cost correctly with audio tokens for gpt-audio-1.5', () => {
    const cost = calculateOpenAICost('gpt-audio-1.5', {}, 1000, 500, 200, 100);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10 + 200 * 32 + 100 * 64) / 1e6, 6);
  });

  it('should calculate cost correctly with audio tokens for gpt-audio (repriced to $32/$64)', () => {
    const cost = calculateOpenAICost('gpt-audio', {}, 1000, 500, 200, 100);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10 + 200 * 32 + 100 * 64) / 1e6, 6);
  });

  it('should calculate cost correctly for the chat-latest alias', () => {
    const cost = calculateOpenAICost('chat-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 5 + 500 * 30) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-audio-mini-2025-12-15', () => {
    const cost = calculateOpenAICost('gpt-audio-mini-2025-12-15', {}, 1000, 500, 200, 100);
    expect(cost).toBeCloseTo((1000 * 0.6 + 500 * 2.4 + 200 * 10 + 100 * 20) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4', () => {
    const cost = calculateOpenAICost('gpt-4', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 60) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-4.1', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-3.5-turbo', () => {
    const cost = calculateOpenAICost('gpt-3.5-turbo', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.5 + 500 * 1.5) / 1e6, 6);
  });

  it('should calculate cost correctly for o4-mini', () => {
    const cost = calculateOpenAICost('o4-mini', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.1 + 500 * 4.4) / 1e6, 6);
  });

  it('should calculate cost correctly for codex-mini-latest', () => {
    const cost = calculateOpenAICost('codex-mini-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.5 + 500 * 6.0) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5', () => {
    const cost = calculateOpenAICost('gpt-5', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.25 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5-chat-latest', () => {
    const cost = calculateOpenAICost('gpt-5-chat-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.25 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5-chat', () => {
    const cost = calculateOpenAICost('gpt-5-chat', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.25 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.1-chat-latest', () => {
    const cost = calculateOpenAICost('gpt-5.1-chat-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.25 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.2-chat-latest', () => {
    const cost = calculateOpenAICost('gpt-5.2-chat-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.75 + 500 * 14) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.3-chat-latest', () => {
    const cost = calculateOpenAICost('gpt-5.3-chat-latest', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.75 + 500 * 14) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.5', () => {
    const cost = calculateOpenAICost('gpt-5.5', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 5 + 500 * 30) / 1e6, 6);
  });

  it.each([
    ['gpt-5.6', 5, 30],
    ['gpt-5.6-sol', 5, 30],
    ['gpt-5.6-terra', 2.5, 15],
    ['gpt-5.6-luna', 1, 6],
  ])('should calculate cost correctly for %s', (model, inputRate, outputRate) => {
    const cost = calculateOpenAICost(model, {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * inputRate + 500 * outputRate) / 1e6, 6);
  });

  it.each([
    ['gpt-5.6', 5, 30, 10, 45],
    ['gpt-5.6-sol', 5, 30, 10, 45],
    ['gpt-5.6-terra', 2.5, 15, 5, 22.5],
    ['gpt-5.6-luna', 1, 6, 2, 9],
  ])('should apply long-context pricing above 272K for %s', (model, baseInputRate, baseOutputRate, longInputRate, longOutputRate) => {
    expect(calculateOpenAICost(model, {}, 272_000, 1_000)).toBeCloseTo(
      (272_000 * baseInputRate + 1_000 * baseOutputRate) / 1e6,
      6,
    );
    expect(calculateOpenAICost(model, {}, 272_001, 1_000)).toBeCloseTo(
      (272_001 * longInputRate + 1_000 * longOutputRate) / 1e6,
      6,
    );
  });

  it('should calculate long-context cost correctly for gpt-5.5', () => {
    const cost = calculateOpenAICost('gpt-5.5', {}, 300_000, 1_000);
    expect(cost).toBeCloseTo((300_000 * 10 + 1_000 * 45) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.5-2026-04-23', () => {
    const cost = calculateOpenAICost('gpt-5.5-2026-04-23', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 5 + 500 * 30) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4', () => {
    const cost = calculateOpenAICost('gpt-5.4', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 15) / 1e6, 6);
  });

  it('should calculate long-context cost correctly for gpt-5.4', () => {
    const cost = calculateOpenAICost('gpt-5.4', {}, 300_000, 1_000);
    expect(cost).toBeCloseTo((300_000 * 5 + 1_000 * 22.5) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-2026-03-05', () => {
    const cost = calculateOpenAICost('gpt-5.4-2026-03-05', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 15) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-mini', () => {
    const cost = calculateOpenAICost('gpt-5.4-mini', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.75 + 500 * 4.5) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-mini-2026-03-17', () => {
    const cost = calculateOpenAICost('gpt-5.4-mini-2026-03-17', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.75 + 500 * 4.5) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-nano', () => {
    const cost = calculateOpenAICost('gpt-5.4-nano', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.2 + 500 * 1.25) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-nano-2026-03-17', () => {
    const cost = calculateOpenAICost('gpt-5.4-nano-2026-03-17', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.2 + 500 * 1.25) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.2-codex', () => {
    const cost = calculateOpenAICost('gpt-5.2-codex', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.75 + 500 * 14) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.2-pro', () => {
    const cost = calculateOpenAICost('gpt-5.2-pro', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 21 + 500 * 168) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.5-pro', () => {
    const cost = calculateOpenAICost('gpt-5.5-pro', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 180) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.5-pro-2026-04-23', () => {
    const cost = calculateOpenAICost('gpt-5.5-pro-2026-04-23', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 180) / 1e6, 6);
  });

  it('should calculate long-context cost correctly for gpt-5.5-pro', () => {
    const cost = calculateOpenAICost('gpt-5.5-pro', {}, 300_000, 1_000);
    expect(cost).toBeCloseTo((300_000 * 60 + 1_000 * 270) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-pro', () => {
    const cost = calculateOpenAICost('gpt-5.4-pro', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 180) / 1e6, 6);
  });

  it('should calculate long-context cost correctly for gpt-5.4-pro', () => {
    const cost = calculateOpenAICost('gpt-5.4-pro', {}, 300_000, 1_000);
    expect(cost).toBeCloseTo((300_000 * 60 + 1_000 * 270) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5.4-pro-2026-03-05', () => {
    const cost = calculateOpenAICost('gpt-5.4-pro-2026-03-05', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 180) / 1e6, 6);
  });

  it('should recognize GPT-5.5 models with built-in pricing', () => {
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.5')).toBe(true);
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.5-2026-04-23')).toBe(true);
    expect(OPENAI_RESPONSES_ONLY_MODELS.some((model) => model.id === 'gpt-5.5-pro')).toBe(true);
    expect(
      OPENAI_RESPONSES_ONLY_MODELS.some((model) => model.id === 'gpt-5.5-pro-2026-04-23'),
    ).toBe(true);
    expect(calculateOpenAICost('gpt-5.5', {}, 1000, 500)).toBeCloseTo(
      (1000 * 5 + 500 * 30) / 1e6,
      6,
    );
    expect(calculateOpenAICost('gpt-5.5-pro', {}, 1000, 500)).toBeCloseTo(
      (1000 * 30 + 500 * 180) / 1e6,
      6,
    );
  });

  it('should recognize GPT-5.6 models for Chat Completions and Responses', () => {
    for (const model of ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) {
      expect(OPENAI_CHAT_MODELS.some((candidate) => candidate.id === model)).toBe(true);
      expect(OPENAI_RESPONSES_ONLY_MODELS.some((candidate) => candidate.id === model)).toBe(false);
    }
  });

  it('should keep GPT-5.4 and GPT-5.5 Pro out of Chat Completions routing', () => {
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.4-pro')).toBe(false);
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.4-pro-2026-03-05')).toBe(false);
    expect(OPENAI_RESPONSES_ONLY_MODELS.some((model) => model.id === 'gpt-5.4-pro')).toBe(true);
    expect(
      OPENAI_RESPONSES_ONLY_MODELS.some((model) => model.id === 'gpt-5.4-pro-2026-03-05'),
    ).toBe(true);
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.5-pro')).toBe(false);
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-5.5-pro-2026-04-23')).toBe(false);
  });

  it('should exclude retired preview audio and realtime models from current routing registries', () => {
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-audio-1.5')).toBe(true);
    expect(OPENAI_CHAT_MODELS.some((model) => model.id === 'gpt-4o-audio-preview')).toBe(false);
    expect(OPENAI_REALTIME_MODELS.some((model) => model.id === 'gpt-realtime-1.5')).toBe(true);
    expect(OPENAI_REALTIME_MODELS.some((model) => model.id === 'gpt-realtime-2')).toBe(true);
    expect(
      OPENAI_REALTIME_MODELS.some(
        (model) => model.id === 'gpt-4o-mini-realtime-preview-2024-12-17',
      ),
    ).toBe(true);
    expect(OPENAI_REALTIME_MODELS.some((model) => model.id === 'gpt-4o-realtime-preview')).toBe(
      false,
    );
  });

  it('should calculate cost correctly for gpt-5-nano', () => {
    const cost = calculateOpenAICost('gpt-5-nano', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.05 + 500 * 0.4) / 1e6, 6);
  });

  it('should calculate cost correctly for gpt-5-mini', () => {
    const cost = calculateOpenAICost('gpt-5-mini', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.25 + 500 * 2) / 1e6, 6);
  });

  it('should handle undefined token counts', () => {
    const cost = calculateOpenAICost('gpt-4', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('should handle unknown models', () => {
    const cost = calculateOpenAICost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config when provided', () => {
    const cost = calculateOpenAICost('gpt-4', { cost: 0.123 }, 1000, 500);
    expect(cost).toBe(184.5);
  });

  it('should use separate custom input and output costs from config when provided', () => {
    const cost = calculateOpenAICost('gpt-4', { inputCost: 0.001, outputCost: 0.003 }, 1000, 500);
    expect(cost).toBe(2.5);
  });

  it('should prefer separate custom input and output costs over custom cost', () => {
    const cost = calculateOpenAICost(
      'gpt-4',
      { cost: 0.123, inputCost: 0.001, outputCost: 0.003 },
      1000,
      500,
    );
    expect(cost).toBe(2.5);
  });

  it('should use custom cost as fallback for partial separate text cost overrides', () => {
    const cost = calculateOpenAICost('gpt-4', { cost: 0.004, outputCost: 0.001 }, 1000, 500);
    expect(cost).toBe(4.5);
  });

  it('should calculate cost correctly with custom audioCost', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioCost: 0.05 },
      1000,
      500,
      200,
      100,
    );
    expect(cost).toBe(15.0075);
  });

  it('should use separate custom audio input and output costs from config when provided', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioInputCost: 0.01, audioOutputCost: 0.03 },
      1000,
      500,
      200,
      100,
    );
    expect(cost).toBe(5.0075);
  });

  it('should prefer separate custom audio costs over custom audioCost', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioCost: 0.05, audioInputCost: 0.01, audioOutputCost: 0.03 },
      1000,
      500,
      200,
      100,
    );
    expect(cost).toBe(5.0075);
  });

  it('should fall back to model default for partial audio override (audioInputCost only)', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioInputCost: 0.01 },
      1000,
      500,
      200,
      100,
    );
    const expected = (2.5 * 1000) / 1e6 + (10 * 500) / 1e6 + 0.01 * 200 + (80 * 100) / 1e6;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it('should fall back to audioCost for partial audio override (audioInputCost + audioCost)', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioCost: 0.02, audioInputCost: 0.01 },
      1000,
      500,
      200,
      100,
    );
    const expected = (2.5 * 1000) / 1e6 + (10 * 500) / 1e6 + 0.01 * 200 + 0.02 * 100;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it('should handle a model with no cost property', () => {
    const cost = calculateOpenAICost('text-davinci-002', {}, 1000, 500);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost correctly for o1-pro', () => {
    const cost = calculateOpenAICost('o1-pro', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 150 + 500 * 600) / 1e6, 6);
  });

  it('should calculate cost correctly for o3-pro', () => {
    const cost = calculateOpenAICost('o3-pro', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 20 + 500 * 80) / 1e6, 6);
  });

  it('should calculate cost correctly for o1-pro-2025-03-19', () => {
    const cost = calculateOpenAICost('o1-pro-2025-03-19', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 150 + 500 * 600) / 1e6, 6);
  });

  it('should calculate cost correctly for o3', () => {
    const cost = calculateOpenAICost('o3', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 6);
  });

  it('should calculate cost correctly for o3-2025-04-16', () => {
    const cost = calculateOpenAICost('o3-2025-04-16', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 6);
  });

  it('should calculate cost correctly for o3-pro-2025-06-10', () => {
    const cost = calculateOpenAICost('o3-pro-2025-06-10', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.06); // 20/1M * 1000 + 80/1M * 500
  });

  it('should calculate audio token costs for gpt-4o-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost('gpt-4o-realtime-preview-2024-12-17', {}, 1000, 500, 200, 100);
    const expectedCost = (1000 * 5 + 500 * 20 + 200 * 40 + 100 * 80) / 1e6;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should calculate audio token costs for gpt-4o-mini-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-mini-realtime-preview-2024-12-17',
      {},
      1000,
      500,
      200,
      100,
    );
    const expectedCost = (1000 * 0.6 + 500 * 2.4 + 200 * 10 + 100 * 20) / 1e6;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should calculate audio token costs for gpt-realtime', () => {
    const cost = calculateOpenAICost('gpt-realtime', {}, 1000, 500, 200, 100);
    const expectedCost = (1000 * 4 + 500 * 16 + 200 * 32 + 100 * 64) / 1e6;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should calculate audio token costs for gpt-realtime-2', () => {
    const cost = calculateOpenAICost('gpt-realtime-2', {}, 1000, 500, 200, 100);
    const expectedCost = (1000 * 4 + 500 * 24 + 200 * 32 + 100 * 64) / 1e6;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should calculate audio token costs for gpt-realtime-mini-2025-12-15', () => {
    const cost = calculateOpenAICost('gpt-realtime-mini-2025-12-15', {}, 1000, 500, 200, 100);
    const expectedCost = (1000 * 0.6 + 500 * 2.4 + 200 * 10 + 100 * 20) / 1e6;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should return zero cost for zero tokens', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 0, 0);
    expect(cost).toBe(0);
  });

  it('should handle only prompt tokens', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 1000, 0);
    expect(cost).toBeCloseTo((1000 * 2) / 1e6, 6);
  });

  it('should handle only completion tokens', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 0, 1000);
    expect(cost).toBeCloseTo((1000 * 8) / 1e6, 6);
  });

  it('should handle large token counts', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo((1000000 * 2 + 1000000 * 8) / 1e6, 6);
  });

  it('should handle mixed undefined audio tokens', () => {
    const cost = calculateOpenAICost('gpt-4o-audio-preview', {}, 1000, 500, undefined, 100);
    expect(cost).toBeUndefined();
  });

  it('should use custom audioCost from config when provided', () => {
    const audioCost = 0.05; // per 1M tokens

    const promptTokens = 1000;
    const completionTokens = 500;
    const audioPromptTokens = 200;
    const audioCompletionTokens = 100;

    const model = OPENAI_CHAT_MODELS.find(
      (m) =>
        m.id === 'gpt-4o-audio-preview' &&
        m.cost &&
        'audioInput' in m.cost &&
        'audioOutput' in m.cost,
    );

    if (!model || !model.cost) {
      return;
    }

    const baseInputCost = model.cost.input * promptTokens;
    const baseOutputCost = model.cost.output * completionTokens;

    const audioInputCostCustom = audioCost * audioPromptTokens;
    const audioOutputCostCustom = audioCost * audioCompletionTokens;

    const expectedTotalCost =
      (baseInputCost + baseOutputCost + audioInputCostCustom + audioOutputCostCustom) / 1;

    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioCost },
      promptTokens,
      completionTokens,
      audioPromptTokens,
      audioCompletionTokens,
    );

    expect(cost).toBeCloseTo(expectedTotalCost, 2);
  });

  it('should handle a non-existent model with no cost property', () => {
    const fakeModelName = 'non-existent-model-with-no-cost';

    const cost = calculateOpenAICost(fakeModelName, {}, 1000, 500);
    expect(cost).toBeUndefined();
  });

  // Legacy GPT-4 model tests
  it('should calculate cost correctly for gpt-4-0314', () => {
    const cost = calculateOpenAICost('gpt-4-0314', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.06); // 30/1M * 1000 + 60/1M * 500
  });

  it('should calculate cost correctly for gpt-4-32k-0314', () => {
    const cost = calculateOpenAICost('gpt-4-32k-0314', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.12); // 60/1M * 1000 + 120/1M * 500
  });

  it('should calculate cost correctly for gpt-4-32k-0613', () => {
    const cost = calculateOpenAICost('gpt-4-32k-0613', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.12); // 60/1M * 1000 + 120/1M * 500
  });

  it('should calculate cost correctly for gpt-4-vision-preview', () => {
    const cost = calculateOpenAICost('gpt-4-vision-preview', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.025); // 10/1M * 1000 + 30/1M * 500
  });

  // Legacy GPT-3.5 model tests
  it('should calculate cost correctly for gpt-3.5-turbo-0301', () => {
    const cost = calculateOpenAICost('gpt-3.5-turbo-0301', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.0025); // 1.5/1M * 1000 + 2/1M * 500
  });

  it('should calculate cost correctly for gpt-3.5-turbo-16k', () => {
    const cost = calculateOpenAICost('gpt-3.5-turbo-16k', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.005); // 3/1M * 1000 + 4/1M * 500
  });

  it('should calculate cost correctly for gpt-3.5-turbo-16k-0613', () => {
    const cost = calculateOpenAICost('gpt-3.5-turbo-16k-0613', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.005); // 3/1M * 1000 + 4/1M * 500
  });

  // Latest audio model test
  it('should calculate cost correctly for gpt-4o-audio-preview-2025-06-03', () => {
    const cost = calculateOpenAICost('gpt-4o-audio-preview-2025-06-03', {}, 1000, 500);
    expect(cost).toBeCloseTo(0.0075); // 2.5/1M * 1000 + 10/1M * 500
  });

  it('should calculate cost correctly for o4-mini (responses model)', () => {
    const cost = calculateOpenAICost('o4-mini', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 1.1 + 500 * 4.4) / 1e6, 6);
  });

  it('should calculate cost correctly for o3-deep-research', () => {
    const cost = calculateOpenAICost('o3-deep-research', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 10 + 500 * 40) / 1e6, 6);
  });

  it('should calculate cost correctly for o3-deep-research-2025-06-26', () => {
    const cost = calculateOpenAICost('o3-deep-research-2025-06-26', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 10 + 500 * 40) / 1e6, 6);
  });

  it('should calculate cost correctly for o4-mini-deep-research', () => {
    const cost = calculateOpenAICost('o4-mini-deep-research', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 6);
  });

  it('should calculate cost correctly for o4-mini-deep-research-2025-06-26', () => {
    const cost = calculateOpenAICost('o4-mini-deep-research-2025-06-26', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2 + 500 * 8) / 1e6, 6);
  });
});

describe('validateFunctionCall', () => {
  const sampleFunction = {
    name: 'testFunction',
    parameters: {
      type: 'object' as const,
      properties: {
        foo: { type: 'string' },
        bar: { type: 'number' },
      },
      required: ['foo'],
    },
  };

  it('should validate valid function call', () => {
    const functionCall = {
      name: 'testFunction',
      arguments: JSON.stringify({ foo: 'test', bar: 123 }),
    };

    expect(() => validateFunctionCall(functionCall, [sampleFunction], {})).not.toThrow();
  });

  it('should throw error for invalid function name', () => {
    const functionCall = {
      name: 'nonexistentFunction',
      arguments: JSON.stringify({ foo: 'test' }),
    };

    expect(() => validateFunctionCall(functionCall, [sampleFunction], {})).toThrow(
      'Called "nonexistentFunction", but there is no function with that name',
    );
  });

  it('should throw error for invalid arguments', () => {
    const functionCall = {
      name: 'testFunction',
      arguments: JSON.stringify({ bar: 'not a number' }),
    };

    expect(() => validateFunctionCall(functionCall, [sampleFunction], {})).toThrow(
      /Call to "testFunction" does not match schema/,
    );
  });
});

describe('formatOpenAiError', () => {
  it('should format error with type and code', () => {
    const error = {
      error: {
        message: 'Error message',
        type: 'error_type',
        code: 'error_code',
      },
    };

    const result = formatOpenAiError(error);
    expect(result).toContain('API error: Error message');
    expect(result).toContain('Type: error_type');
    expect(result).toContain('Code: error_code');
  });

  it('should format error without type and code', () => {
    const error = {
      error: {
        message: 'Error message',
      },
    };

    const result = formatOpenAiError(error);
    expect(result).toContain('API error: Error message');
    expect(result).not.toContain('Type:');
    expect(result).not.toContain('Code:');
  });
});
