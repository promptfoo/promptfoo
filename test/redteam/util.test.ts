import { fetchWithCache } from '../../src/cache';
import {
  extractGoalFromPrompt,
  getSessionId,
  getShortPluginId,
  isBasicRefusal,
  isEmptyResponse,
  normalizeApostrophes,
  removePrefix,
} from '../../src/redteam/util';

import type { CallApiContextParams, ProviderResponse } from '../../src/types';

jest.mock('../../src/cache');

describe('removePrefix', () => {
  it('should remove a simple prefix', () => {
    expect(removePrefix('Prompt: Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should be case insensitive', () => {
    expect(removePrefix('PROMPT: Hello world', 'prompt')).toBe('Hello world');
  });

  it('should remove asterisks from the prefix', () => {
    expect(removePrefix('**Prompt:** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should handle multiple asterisks', () => {
    expect(removePrefix('***Prompt:*** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should return the same string if prefix is not found', () => {
    expect(removePrefix('Hello world', 'Prefix')).toBe('Hello world');
  });

  it('should handle empty strings', () => {
    expect(removePrefix('', 'Prefix')).toBe('');
  });

  it('should handle prefix that is the entire string', () => {
    expect(removePrefix('Prompt:', 'Prompt')).toBe('');
  });
});

describe('normalizeApostrophes', () => {
  it('should normalize different types of apostrophes', () => {
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes('I′m')).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
  });

  it('should handle strings without apostrophes', () => {
    expect(normalizeApostrophes('Hello world')).toBe('Hello world');
  });
});

describe('isEmptyResponse', () => {
  it('should return true for empty responses', () => {
    expect(isEmptyResponse('')).toBe(true);
    expect(isEmptyResponse('   ')).toBe(true);
    expect(isEmptyResponse('{}')).toBe(true);
    expect(isEmptyResponse('  {}  ')).toBe(true);
    expect(isEmptyResponse('undefined')).toBe(true);
    expect(isEmptyResponse('  undefined  ')).toBe(true);
    expect(isEmptyResponse('UNDEFINED')).toBe(true);
    expect(isEmptyResponse('null')).toBe(true);
    expect(isEmptyResponse('  NULL  ')).toBe(true);
  });

  it('should return false for non-empty responses', () => {
    expect(isEmptyResponse('Hello')).toBe(false);
    expect(isEmptyResponse('{"key": "value"}')).toBe(false);
    expect(isEmptyResponse('undefined behavior')).toBe(false);
    expect(isEmptyResponse('null pointer')).toBe(false);
  });
});

describe('isBasicRefusal', () => {
  it('should detect refusal prefixes', () => {
    expect(isBasicRefusal('I am sorry, I cannot help with that')).toBe(true);
    expect(isBasicRefusal("I'm not able to assist with this request")).toBe(true);
    expect(isBasicRefusal('I apologize, but I cannot do that')).toBe(true);
  });

  it('should detect refusal substrings', () => {
    expect(isBasicRefusal('As an AI language model, I cannot help with that')).toBe(true);
    expect(isBasicRefusal('I cannot assist with that request')).toBe(true);
    expect(isBasicRefusal('That would not be appropriate')).toBe(true);
  });

  it('should normalize apostrophes in responses', () => {
    expect(isBasicRefusal("I′m sorry, I can't help")).toBe(true);
    expect(isBasicRefusal("I'm unable to assist")).toBe(true);
  });

  it('should handle case insensitivity', () => {
    expect(isBasicRefusal('I AM SORRY, I CANNOT HELP')).toBe(true);
    expect(isBasicRefusal('as an ai language model')).toBe(true);
  });

  it('should return false for non-refusal responses', () => {
    expect(isBasicRefusal('I will help you with that')).toBe(false);
    expect(isBasicRefusal('Here is the information you requested')).toBe(false);
    expect(isBasicRefusal('The answer is 42')).toBe(false);
  });
});

describe('getShortPluginId', () => {
  it('should remove promptfoo:redteam: prefix', () => {
    expect(getShortPluginId('promptfoo:redteam:test')).toBe('test');
  });

  it('should return original if no prefix', () => {
    expect(getShortPluginId('test')).toBe('test');
  });
});

describe('extractGoalFromPrompt', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should successfully extract goal', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'test goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBe('test goal');
  });

  it('should return null on HTTP error', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      data: {},
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should return null when no intent returned', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {},
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should return null when API throws error', async () => {
    jest.mocked(fetchWithCache).mockRejectedValue(new Error('API error'));

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');
    expect(result).toBeNull();
  });

  it('should handle empty prompt and purpose', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'empty goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt('', '');
    expect(result).toBe('empty goal');
  });

  it('should include plugin context when pluginId is provided', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'plugin-specific goal' },
      deleteFromCache: async () => {},
    });

    const result = await extractGoalFromPrompt(
      'innocent prompt',
      'test purpose',
      'indirect-prompt-injection',
    );
    expect(result).toBe('plugin-specific goal');

    // Verify that the API was called with plugin context
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('pluginContext'),
      }),
      expect.any(Number),
    );
  });

  it('should skip remote call when remote generation is disabled', async () => {
    // Preserve original environment setting
    const originalValue = process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = 'true';

    const result = await extractGoalFromPrompt('test prompt', 'test purpose');

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();

    // Cleanup: restore or delete the env var to avoid leaking into other tests
    if (originalValue === undefined) {
      delete process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION;
    } else {
      process.env.PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION = originalValue;
    }
  });

  it('should skip goal extraction for dataset plugins with short plugin ID', async () => {
    const result = await extractGoalFromPrompt('test prompt', 'test purpose', 'beavertails');

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should skip goal extraction for dataset plugins with full plugin ID', async () => {
    const result = await extractGoalFromPrompt(
      'test prompt',
      'test purpose',
      'promptfoo:redteam:cyberseceval',
    );

    expect(result).toBeNull();
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should skip goal extraction for all dataset plugins', async () => {
    const datasetPlugins = [
      'beavertails',
      'cyberseceval',
      'donotanswer',
      'harmbench',
      'toxic-chat',
      'aegis',
      'pliny',
      'unsafebench',
      'xstest',
    ];

    for (const pluginId of datasetPlugins) {
      const result = await extractGoalFromPrompt('test prompt', 'test purpose', pluginId);
      expect(result).toBeNull();

      // Also test with full plugin ID format
      const fullPluginId = `promptfoo:redteam:${pluginId}`;
      const resultFull = await extractGoalFromPrompt('test prompt', 'test purpose', fullPluginId);
      expect(resultFull).toBeNull();
    }

    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('should proceed with API call for non-dataset plugins', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'extracted goal' },
      deleteFromCache: async () => {},
    });

    // Test with a non-dataset plugin
    const result = await extractGoalFromPrompt('test prompt', 'test purpose', 'prompt-extraction');

    expect(result).toBe('extracted goal');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
  });

  it('should proceed with API call for non-dataset plugins with full plugin ID', async () => {
    jest.mocked(fetchWithCache).mockResolvedValue({
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { intent: 'extracted goal' },
      deleteFromCache: async () => {},
    });

    // Test with a full non-dataset plugin ID
    const result = await extractGoalFromPrompt(
      'test prompt',
      'test purpose',
      'promptfoo:redteam:sql-injection',
    );

    expect(result).toBe('extracted goal');
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
  });
});

describe('getSessionId', () => {
  describe('error handling - should never throw', () => {
    it('should handle undefined response and undefined context', () => {
      expect(() => getSessionId(undefined, undefined)).not.toThrow();
      expect(getSessionId(undefined, undefined)).toBeUndefined();
    });

    it('should handle null response and undefined context', () => {
      expect(() => getSessionId(null, undefined)).not.toThrow();
      expect(getSessionId(null, undefined)).toBeUndefined();
    });

    it('should handle undefined response and null context', () => {
      expect(() => getSessionId(undefined, null as any)).not.toThrow();
      expect(getSessionId(undefined, null as any)).toBeUndefined();
    });

    it('should handle null response and null context', () => {
      expect(() => getSessionId(null, null as any)).not.toThrow();
      expect(getSessionId(null, null as any)).toBeUndefined();
    });

    it('should handle response without sessionId and context without vars', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: {},
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should handle response without sessionId and undefined vars', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: undefined as any,
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should handle response with empty object sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: {} as any };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: {},
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('{}');
    });

    it('should handle context with non-string sessionId (number)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 123 as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('123');
    });

    it('should handle context with non-string sessionId (object)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: { id: 'test' } as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('{"id":"test"}');
    });

    it('should handle context with non-string sessionId (null)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: null as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should handle context with non-string sessionId (undefined)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: undefined as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should handle context with non-string sessionId (array)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: ['session-1', 'session-2'] as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('["session-1","session-2"]');
    });

    it('should handle context with non-string sessionId (boolean)', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: true as any },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('true');
    });

    it('should handle context with empty string sessionId', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: '' },
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });
  });

  describe('valid sessionId extraction', () => {
    it('should extract sessionId from response', () => {
      const response: ProviderResponse = { output: 'test', sessionId: 'response-session-123' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: {},
      };
      expect(getSessionId(response, context)).toBe('response-session-123');
    });

    it('should extract sessionId from context.vars as fallback', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 'vars-session-456' },
      };
      expect(getSessionId(response, context)).toBe('vars-session-456');
    });

    it('should prioritize response.sessionId over context.vars.sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: 'response-priority' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 'vars-ignored' },
      };
      expect(getSessionId(response, context)).toBe('response-priority');
    });

    it('should handle response with empty string sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: '' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 'vars-fallback' },
      };
      // Empty string is a valid value with nullish coalescing, so it's returned as-is
      expect(getSessionId(response, context)).toBe('vars-fallback');
    });

    it('should handle response with null sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: null as any };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 'vars-fallback' },
      };
      // null is falsy, so it should fall back to vars
      expect(getSessionId(response, context)).toBe('vars-fallback');
    });

    it('should handle response with undefined sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: undefined };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 'vars-fallback' },
      };
      expect(getSessionId(response, context)).toBe('vars-fallback');
    });
  });

  describe('return undefined cases', () => {
    it('should return undefined when both response and context have no sessionId', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { otherVar: 'value' },
      };
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should return undefined when response is missing and context has no sessionId', () => {
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { otherVar: 'value' },
      };
      expect(getSessionId(undefined, context)).toBeUndefined();
    });

    it('should return undefined when response has no sessionId and context is missing', () => {
      const response: ProviderResponse = { output: 'test' };
      expect(getSessionId(response, undefined)).toBeUndefined();
    });

    it('should return undefined when context vars has non-string sessionId', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { sessionId: 12345 as any },
      };
      expect(getSessionId(response, context)).toBe('12345');
    });
  });

  describe('edge cases with malformed inputs', () => {
    it('should handle response with only sessionId property', () => {
      const response = { sessionId: 'only-session' } as ProviderResponse;
      expect(() => getSessionId(response, undefined)).not.toThrow();
      expect(getSessionId(response, undefined)).toBe('only-session');
    });

    it('should handle context with nested vars structure', () => {
      const response: ProviderResponse = { output: 'test' };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: { nested: { sessionId: 'nested-session' } } as any,
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBeUndefined();
    });

    it('should handle response with numeric sessionId', () => {
      const response: ProviderResponse = { output: 'test', sessionId: 999 as any };
      const context: CallApiContextParams = {
        prompt: { raw: 'test', label: 'test' },
        vars: {},
      };
      expect(() => getSessionId(response, context)).not.toThrow();
      expect(getSessionId(response, context)).toBe('999');
    });

    it('should handle sessionId with special characters', () => {
      const specialSessionId = 'session-!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const response: ProviderResponse = { output: 'test', sessionId: specialSessionId };
      expect(() => getSessionId(response, undefined)).not.toThrow();
      expect(getSessionId(response, undefined)).toBe(specialSessionId);
    });

    it('should handle sessionId with Unicode characters', () => {
      const unicodeSessionId = 'session-测试-🎉-مرحبا';
      const response: ProviderResponse = { output: 'test', sessionId: unicodeSessionId };
      expect(() => getSessionId(response, undefined)).not.toThrow();
      expect(getSessionId(response, undefined)).toBe(unicodeSessionId);
    });
  });
});
