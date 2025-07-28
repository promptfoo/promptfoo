import OpenAI from 'openai';
import {
  calculateOpenAICost,
  failApiCall,
  formatOpenAiError,
  getTokenUsage,
  OPENAI_CHAT_MODELS,
  validateFunctionCall,
} from '../../../src/providers/openai/util';

jest.mock('../../../src/cache');

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
    });
  });

  it('should return cached token usage', () => {
    const data = {
      usage: {
        total_tokens: 100,
      },
    };

    const result = getTokenUsage(data, true);
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
      completionDetails: {
        reasoning: 20,
        acceptedPrediction: 30,
        rejectedPrediction: 10,
      },
    });
  });
});

describe('calculateOpenAICost', () => {
  it('should calculate cost correctly for transcription model gpt-4o-transcribe', () => {
    const cost = calculateOpenAICost('gpt-4o-transcribe', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for transcription model gpt-4o-mini-transcribe', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-transcribe', {}, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10) / 1e6, 6);
  });

  it('should calculate cost correctly for TTS model gpt-4o-mini-tts', () => {
    const cost = calculateOpenAICost('gpt-4o-mini-tts', {}, 1000, 500);
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

  it('should calculate cost correctly with audio tokens', () => {
    const cost = calculateOpenAICost('gpt-4o-audio-preview', {}, 1000, 500, 200, 100);
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10 + 200 * 40 + 100 * 80) / 1e6, 6);
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

  it('should return undefined for zero tokens', () => {
    const cost = calculateOpenAICost('gpt-4.1', {}, 0, 0);
    expect(cost).toBeUndefined();
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

    const promiseTokens = 1000;
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

    const baseInputCost = model.cost.input * promiseTokens;
    const baseOutputCost = model.cost.output * completionTokens;

    const audioInputCostCustom = audioCost * audioPromptTokens;
    const audioOutputCostCustom = audioCost * audioCompletionTokens;

    const expectedTotalCost =
      (baseInputCost + baseOutputCost + audioInputCostCustom + audioOutputCostCustom) / 1;

    const cost = calculateOpenAICost(
      'gpt-4o-audio-preview',
      { audioCost },
      promiseTokens,
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
