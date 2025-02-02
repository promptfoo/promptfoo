import OpenAI from 'openai';
import {
  calculateOpenAICost,
  failApiCall,
  getTokenUsage,
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
});

describe('calculateOpenAICost', () => {
  it('should calculate cost correctly', () => {
    const cost = calculateOpenAICost('gpt-4', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('should handle unknown models', () => {
    const cost = calculateOpenAICost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });
});
