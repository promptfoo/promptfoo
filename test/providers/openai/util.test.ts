import OpenAI from 'openai';
import {
  calculateOpenAICost,
  failApiCall,
  getTokenUsage,
  validateFunctionCall,
  formatOpenAiError,
} from '../../../src/providers/openai/util';

jest.mock('../../../src/cache');

describe('failApiCall', () => {
  it('should format OpenAI API errors', () => {
    const error = new OpenAI.APIError(400, {}, 'Bad request', {});
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
  it('should calculate cost correctly for gpt-4', () => {
    const cost = calculateOpenAICost('gpt-4', { cost: undefined }, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 30 + 500 * 60) / 1000000, 6);
  });

  it('should calculate cost correctly for gpt-4.5-preview', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview', { cost: undefined }, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 75 + 500 * 150) / 1000000, 6);
  });

  it('should calculate cost correctly for gpt-4.5-preview-2025-02-27', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview-2025-02-27', { cost: undefined }, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 75 + 500 * 150) / 1000000, 6);
  });

  it('should calculate cost correctly for gpt-3.5-turbo', () => {
    const cost = calculateOpenAICost('gpt-3.5-turbo', { cost: undefined }, 1000, 500);
    expect(cost).toBeCloseTo((1000 * 0.5 + 500 * 1.5) / 1000000, 6);
  });

  it('should calculate cost correctly for gpt-4o-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-realtime-preview-2024-12-17',
      { cost: undefined },
      1000,
      500,
    );
    expect(cost).toBeCloseTo((1000 * 2.5 + 500 * 10) / 1000000, 6);
  });

  it('should calculate cost correctly for gpt-4o-mini-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-mini-realtime-preview-2024-12-17',
      { cost: undefined },
      1000,
      500,
    );
    expect(cost).toBeCloseTo((1000 * 0.15 + 500 * 0.6) / 1000000, 6);
  });

  it('should calculate audio token costs for gpt-4o-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-realtime-preview-2024-12-17',
      { cost: undefined },
      1000,
      500,
      200,
      100,
    );
    const expectedCost = (1000 * 2.5 + 500 * 10 + 200 * 40 + 100 * 80) / 1000000;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should calculate audio token costs for gpt-4o-mini-realtime-preview-2024-12-17', () => {
    const cost = calculateOpenAICost(
      'gpt-4o-mini-realtime-preview-2024-12-17',
      { cost: undefined },
      1000,
      500,
      200,
      100,
    );
    const expectedCost = (1000 * 0.15 + 500 * 0.6 + 200 * 10 + 100 * 20) / 1000000;
    expect(cost).toBeCloseTo(expectedCost, 6);
  });

  it('should handle undefined token counts', () => {
    const cost = calculateOpenAICost('gpt-4', { cost: undefined }, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('should handle unknown models', () => {
    const cost = calculateOpenAICost('unknown-model', { cost: undefined }, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config when provided', () => {
    const cost = calculateOpenAICost('gpt-4', { cost: 0.123 }, 1000, 500);
    expect(cost).toBe(184.5);
  });

  it('should return undefined for zero tokens', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview', { cost: undefined }, 0, 0);
    expect(cost).toBeUndefined();
  });

  it('should handle only prompt tokens', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview', { cost: undefined }, 1000, 0);
    expect(cost).toBeCloseTo((1000 * 75) / 1000000, 6);
  });

  it('should handle only completion tokens', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview', { cost: undefined }, 0, 1000);
    expect(cost).toBeCloseTo((1000 * 150) / 1000000, 6);
  });

  it('should handle large token counts', () => {
    const cost = calculateOpenAICost('gpt-4.5-preview', { cost: undefined }, 1000000, 1000000);
    expect(cost).toBeCloseTo((1000000 * 75 + 1000000 * 150) / 1000000, 6);
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
      arguments: JSON.stringify({ bar: 123 }), // missing required 'foo'
    };

    expect(() => validateFunctionCall(functionCall, [sampleFunction], {})).toThrow(
      'Call to "testFunction" does not match schema',
    );
  });
});

describe('formatOpenAiError', () => {
  it('should format error with type and code', () => {
    const error = {
      error: {
        message: 'Test error',
        type: 'invalid_request',
        code: 'invalid_api_key',
      },
    };
    const result = formatOpenAiError(error);
    expect(result).toContain('API error: Test error');
    expect(result).toContain('Type: invalid_request');
    expect(result).toContain('Code: invalid_api_key');
  });

  it('should format error without type and code', () => {
    const error = {
      error: {
        message: 'Test error',
      },
    };
    const result = formatOpenAiError(error);
    expect(result).toContain('API error: Test error');
    expect(result).not.toContain('Type:');
    expect(result).not.toContain('Code:');
  });
});
