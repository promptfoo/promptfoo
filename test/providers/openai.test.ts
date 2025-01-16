import OpenAI from 'openai';
import { failApiCall, getTokenUsage } from '../../src/providers/openai';

describe('failApiCall', () => {
  it('should format OpenAI API error', () => {
    const error = new OpenAI.APIError(
      400,
      {
        status: 400,
        headers: {},
        error: {
          message: 'Invalid request',
          type: 'invalid_request_error',
        },
      },
      'Invalid request',
      {},
    );

    const result = failApiCall(error);
    expect(result).toEqual({
      error: `API error: ${error.type} ${error.message}`,
    });
  });

  it('should format generic error', () => {
    const error = new Error('Something went wrong');
    const result = failApiCall(error);
    expect(result).toEqual({
      error: `API error: Error: Something went wrong`,
    });
  });
});

describe('getTokenUsage', () => {
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

  it('should return uncached token usage', () => {
    const data = {
      usage: {
        total_tokens: 100,
        prompt_tokens: 50,
        completion_tokens: 50,
      },
    };
    const result = getTokenUsage(data, false);
    expect(result).toEqual({
      total: 100,
      prompt: 50,
      completion: 50,
    });
  });

  it('should handle missing usage data', () => {
    const data = {};
    const result = getTokenUsage(data, false);
    expect(result).toEqual({});
  });
});
