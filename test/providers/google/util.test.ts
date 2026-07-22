import * as fs from 'fs';

import * as nunjucks from 'nunjucks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import logger from '../../../src/logger';
import { GOOGLE_MODELS } from '../../../src/providers/google/shared';
import {
  calculateGoogleCost,
  calculateGoogleCostFromUsage,
  clearCachedAuth,
  collectGroundingMetadata,
  geminiFormatAndSystemInstructions,
  getGoogleResponseServiceTier,
  loadFile,
  maybeCoerceToGeminiFormat,
  mergeGoogleCompletionOptions,
  mergeGoogleRequestTools,
  mergeParts,
  normalizeGoogleServiceTier,
  normalizeSafetySettings,
  normalizeTools,
  parseStringObject,
  removeDeprecatedGeminiGenerationParams,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
  resolveProjectId,
  sanitizeSchemaForGemini,
  stripExecutableToolFileReferences,
  validateFunctionCall,
} from '../../../src/providers/google/util';

import type { Tool } from '../../../src/providers/google/types';

// Create a comprehensive mock for Google Auth Library
// This prevents the real library from reading ~/.config/gcloud/ or environment
const googleAuthMock = vi.hoisted(() => {
  const mockAuthInstance = {
    getClient: vi.fn().mockResolvedValue({ name: 'mockClient' }),
    fromJSON: vi.fn().mockImplementation((credentials: any) => {
      return Promise.resolve({ name: 'mockCredentialClient', credentials });
    }),
    getProjectId: vi.fn().mockResolvedValue('google-auth-project'),
  };

  return {
    GoogleAuth: vi.fn().mockImplementation(function (this: any) {
      // Return the mock instance
      Object.assign(this, mockAuthInstance);
      return this;
    }),
    mockAuthInstance, // Export for test access
  };
});

function resetGoogleAuthMock() {
  const { GoogleAuth, mockAuthInstance } = googleAuthMock;

  mockAuthInstance.getClient.mockReset();
  mockAuthInstance.fromJSON.mockReset();
  mockAuthInstance.getProjectId.mockReset();
  GoogleAuth.mockReset();

  mockAuthInstance.getClient.mockResolvedValue({ name: 'mockClient' });
  mockAuthInstance.fromJSON.mockImplementation((credentials: any) => {
    return Promise.resolve({ name: 'mockCredentialClient', credentials });
  });
  mockAuthInstance.getProjectId.mockResolvedValue('google-auth-project');
  GoogleAuth.mockImplementation(function (this: any) {
    Object.assign(this, mockAuthInstance);
    return this;
  });
}

// Mock both the module and dynamic imports
vi.mock('google-auth-library', () => googleAuthMock);

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),

    hasMagic: (path: string) => {
      // Match the real hasMagic behavior: only detect patterns in forward-slash paths
      // This mimics glob's actual behavior where backslash paths return false
      return /[*?[\]{}]/.test(path) && !path.includes('\\');
    },
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    existsSync: vi.fn().mockImplementation(function (path) {
      // Block gcloud config directory access
      if (
        typeof path === 'string' &&
        (path.includes('.config/gcloud') || path.includes('gcloud/configurations'))
      ) {
        return false;
      }
      if (path === 'file://system_instruction.json') {
        return true;
      }
      return false;
    }),

    readFileSync: vi.fn().mockImplementation(function (path) {
      // Block gcloud config file reads
      if (
        typeof path === 'string' &&
        (path.includes('.config/gcloud') || path.includes('gcloud/configurations'))
      ) {
        throw new Error('ENOENT: no such file or directory');
      }
      if (path === 'file://system_instruction.json') {
        return 'system instruction';
      }
      throw new Error(`Mock file not found: ${path}`);
    }),

    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

describe('util', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetGoogleAuthMock();
  });

  describe('parseStringObject', () => {
    it('should parse string input to object', () => {
      const input = '{"key": "value"}';
      expect(parseStringObject(input)).toEqual({ key: 'value' });
    });

    it('should return object input as-is', () => {
      const input = { key: 'value' };
      expect(parseStringObject(input)).toBe(input);
    });

    it('should return undefined as-is', () => {
      expect(parseStringObject(undefined)).toBeUndefined();
    });
  });

  describe('Google service tiers', () => {
    it.each([
      ['standard', false, 'standard'],
      ['priority', false, 'priority'],
      ['flex', false, 'flex'],
      ['SERVICE_TIER_PRIORITY', false, 'priority'],
      ['standard', true, 'SERVICE_TIER_STANDARD'],
      ['priority', true, 'SERVICE_TIER_PRIORITY'],
      ['flex', true, 'SERVICE_TIER_FLEX'],
      ['SERVICE_TIER_FLEX', true, 'SERVICE_TIER_FLEX'],
    ])('normalizes %s for Vertex=%s', (tier, vertexai, expected) => {
      expect(normalizeGoogleServiceTier(tier, vertexai)).toBe(expected);
    });

    it('preserves an unknown tier so the API can reject it', () => {
      expect(normalizeGoogleServiceTier('custom', true)).toBe('custom');
    });

    it('prefers the actual tier reported in response headers', () => {
      expect(
        getGoogleResponseServiceTier(
          { 'X-Gemini-Service-Tier': 'standard' },
          { serviceTier: 'SERVICE_TIER_PRIORITY' },
        ),
      ).toBe('standard');
    });

    it('falls back to the actual tier reported in usage metadata', () => {
      expect(getGoogleResponseServiceTier(undefined, { service_tier: 'SERVICE_TIER_FLEX' })).toBe(
        'flex',
      );
    });
  });

  describe('removeDeprecatedGeminiGenerationParams', () => {
    it.each([
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
    ])('removes unsupported sampling and penalty parameters for %s', (modelName) => {
      expect(
        removeDeprecatedGeminiGenerationParams(modelName, {
          temperature: 0.5,
          topP: 0.5,
          top_p: 0.5,
          topK: 10,
          top_k: 10,
          candidateCount: 2,
          candidate_count: 2,
          presencePenalty: 0.5,
          presence_penalty: 0.5,
          frequencyPenalty: 0.5,
          frequency_penalty: 0.5,
          maxOutputTokens: 128,
        }),
      ).toEqual({ maxOutputTokens: 128 });
    });

    it('preserves generation parameters for other Gemini models', () => {
      const config = { presencePenalty: 0.5, frequencyPenalty: 0.5 };

      expect(removeDeprecatedGeminiGenerationParams('gemini-2.5-flash', config)).toBe(config);
    });
  });

  describe('mergeGoogleRequestTools', () => {
    it('omits tools when no configured or passthrough tools exist', () => {
      expect(mergeGoogleRequestTools([], undefined)).toBeUndefined();
    });

    it('merges configured tools with a single passthrough tool', () => {
      expect(mergeGoogleRequestTools([{ googleSearch: {} }], { codeExecution: {} })).toEqual([
        { googleSearch: {} },
        { codeExecution: {} },
      ]);
    });

    it('preserves explicitly empty passthrough tools', () => {
      expect(mergeGoogleRequestTools([], [])).toEqual([]);
    });
  });

  describe('validateFunctionCall', () => {
    const mockFunctions: Tool[] = [
      {
        functionDeclarations: [
          {
            name: 'testFunction',
            parameters: {
              type: 'OBJECT',
              properties: {
                param1: { type: 'STRING' },
              },
              required: ['param1'],
            },
          },
          {
            name: 'emptyFunction',
          },
          {
            name: 'invalidSchemaFunction',
            parameters: {
              type: 'OBJECT',
              properties: {
                param1: { type: 'STRING' },
                param2: { type: 'STRING', enum: ['test'] },
              },
            },
          },
          {
            name: 'propertyOrderingFunction',
            parameters: {
              type: 'OBJECT',
              properties: {
                param1: { type: 'STRING' },
              },
              propertyOrdering: ['param1', 'param2'],
            },
          },
          {
            name: 'uncompilableFunction',
            parameters: {
              type: 'OBJECT',
              properties: {
                param1: { type: 'TYPE_UNSPECIFIED' },
              },
            },
          },
        ],
      },
    ];

    it('should validate Vertex/AIS format function call', () => {
      const output = [
        {
          functionCall: {
            name: 'testFunction',
            args: '{"param1": "test"}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).not.toThrow();
    });

    it('should validate Live format function call', () => {
      const output = {
        toolCall: {
          functionCalls: [
            {
              name: 'testFunction',
              args: '{"param1": "test"}',
            },
          ],
        },
      };
      expect(() => validateFunctionCall(output, mockFunctions)).not.toThrow();
    });

    it('should validate empty function args', () => {
      const output = [
        {
          functionCall: {
            name: 'emptyFunction',
            args: '{}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).not.toThrow();
    });

    it('should validate function with no parameters', () => {
      const output = [
        {
          functionCall: {
            name: 'emptyFunction',
            args: '{}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).not.toThrow();
    });

    it('should throw error for invalid function call format', () => {
      const output = {
        invalidFormat: true,
      };
      expect(() => validateFunctionCall(output, mockFunctions)).toThrow(
        'Google did not return a valid-looking function call',
      );
    });

    it('should throw error for non-existent function', () => {
      const output = [
        {
          functionCall: {
            name: 'nonExistentFunction',
            args: '{}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).toThrow(
        'Called "nonExistentFunction", but there is no function with that name',
      );
    });

    it('should throw error for invalid args', () => {
      const output = [
        {
          functionCall: {
            name: 'testFunction',
            args: '{}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).toThrow(/does not match schema/);
    });

    it('should throw error when schema compilation fails', () => {
      const output = [
        {
          functionCall: {
            name: 'uncompilableFunction',
            args: '{"param1": "test"}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).toThrow(
        /Tool schema doesn't compile with ajv:.*If this is a valid tool schema you may need to reformulate your assertion without is-valid-function-call/,
      );
    });

    it('should throw error when propertyOrdering references invalid property', () => {
      const output = [
        {
          functionCall: {
            name: 'propertyOrderingFunction',
            args: '{"param1": "test"}',
          },
        },
      ];
      expect(() => validateFunctionCall(output, mockFunctions)).toThrow(
        /Tool schema doesn't compile with ajv:.*If this is a valid tool schema you may need to reformulate your assertion without is-valid-function-call/,
      );
    });
  });

  describe('maybeCoerceToGeminiFormat', () => {
    it('should handle string input', () => {
      const input = 'test message';
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [{ parts: [{ text: 'test message' }] }],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle OpenAI chat format', () => {
      const input = [
        { role: 'user', content: 'Hello' },
        { role: 'model', content: 'Hi there' },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there' }] },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should map assistant role to model role by default', () => {
      const input = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is its population?' },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
          { role: 'model', parts: [{ text: 'The capital of France is Paris.' }] }, // assistant mapped to model
          { role: 'user', parts: [{ text: 'What is its population?' }] },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should preserve assistant role when useAssistantRole is true', () => {
      const input = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is its population?' },
      ];
      const result = maybeCoerceToGeminiFormat(input, { useAssistantRole: true });
      expect(result).toEqual({
        contents: [
          { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
          { role: 'assistant', parts: [{ text: 'The capital of France is Paris.' }] }, // assistant preserved
          { role: 'user', parts: [{ text: 'What is its population?' }] },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should map assistant to model when useAssistantRole is false', () => {
      const input = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = maybeCoerceToGeminiFormat(input, { useAssistantRole: false });
      expect(result).toEqual({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there' }] },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle OpenAI chat format with array content', () => {
      const input = [
        {
          role: 'user',
          content: ['Hello', { type: 'text', text: 'World' }],
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }, { text: 'World' }],
          },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should respect useAssistantRole flag with array content', () => {
      const input = [
        { role: 'user', content: [{ type: 'text', text: 'Question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
      ];

      // Test with useAssistantRole: true
      const resultWithAssistant = maybeCoerceToGeminiFormat(input, { useAssistantRole: true });
      expect(resultWithAssistant.contents[1].role).toBe('assistant');

      // Test with useAssistantRole: false (default)
      const resultWithModel = maybeCoerceToGeminiFormat(input, { useAssistantRole: false });
      expect(resultWithModel.contents[1].role).toBe('model');
    });

    it('should handle OpenAI chat format with object content', () => {
      const input = [
        {
          role: 'user',
          content: { text: 'Hello' },
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle single content object', () => {
      const input = {
        parts: [{ text: 'test' }],
      };
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [{ parts: [{ text: 'test' }] }],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should extract system instructions', () => {
      const input = [
        { role: 'system', content: 'System instruction' },
        { role: 'user', content: 'User message' },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'User message' }] }],
        coerced: true,
        systemInstruction: {
          parts: [{ text: 'System instruction' }],
        },
      });
    });

    it('should handle unknown format and return empty array for non-array input', () => {
      const input = { unknown: 'format' };
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        `Unknown format for Gemini: ${JSON.stringify(input)}`,
      );
    });

    it('should handle null input and return empty array', () => {
      const input = null;
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Unknown format for Gemini: null`);
    });

    it('should handle undefined input and return empty array', () => {
      const input = undefined;
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Unknown format for Gemini: undefined`);
    });

    it('should handle number input and return empty array', () => {
      const input = 42;
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Unknown format for Gemini: 42`);
    });

    it('should handle boolean input and return empty array', () => {
      const input = true;
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Unknown format for Gemini: true`);
    });

    it('should handle array input in unknown format path and return array as-is', () => {
      // Arrays that don't match known formats are still arrays, so they're returned as-is
      // This is safe because arrays won't cause .map() errors downstream
      const input = [1, 2, 3];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [1, 2, 3],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(`Unknown format for Gemini: [1,2,3]`);
    });

    it('should handle OpenAI chat format with mixed content types', () => {
      const input = [
        {
          role: 'user',
          content: [
            'Text message',
            { type: 'text', text: 'Formatted text' },
            { type: 'image', url: 'http://example.com/image.jpg' },
          ],
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Text message' },
              { text: 'Formatted text' },
              { type: 'image', url: 'http://example.com/image.jpg' },
            ],
          },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle content with MAX_TOKENS finish reason', () => {
      const input = [
        {
          role: 'model',
          content: { text: 'Truncated response' },
          finishReason: 'MAX_TOKENS',
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result.contents[0]).toEqual({
        role: 'model',
        parts: [{ text: 'Truncated response' }],
      });
    });

    it('should handle content with RECITATION finish reason', () => {
      const input = [
        {
          role: 'model',
          content: { text: 'Recited content' },
          finishReason: 'RECITATION',
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result.contents[0]).toEqual({
        role: 'model',
        parts: [{ text: 'Recited content' }],
      });
    });

    it('should handle content with BLOCKLIST finish reason', () => {
      const input = [
        {
          role: 'model',
          content: { text: 'Blocked content' },
          finishReason: 'BLOCKLIST',
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result.contents[0]).toEqual({
        role: 'model',
        parts: [{ text: 'Blocked content' }],
      });
    });

    it('should handle content with PROHIBITED_CONTENT finish reason', () => {
      const input = [
        {
          role: 'model',
          content: { text: 'Prohibited content' },
          finishReason: 'PROHIBITED_CONTENT',
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result.contents[0]).toEqual({
        role: 'model',
        parts: [{ text: 'Prohibited content' }],
      });
    });

    it('should handle content with SPII finish reason', () => {
      const input = [
        {
          role: 'model',
          content: { text: 'Sensitive information' },
          finishReason: 'SPII',
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result.contents[0]).toEqual({
        role: 'model',
        parts: [{ text: 'Sensitive information' }],
      });
    });

    it('should return unmodified content if it matches GeminiFormat', () => {
      const input = [
        {
          role: 'user',
          parts: [{ text: 'Hello, Gemini!' }],
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: input,
        coerced: false,
        systemInstruction: undefined,
      });
    });

    it('should preserve native Gemini tool history and thought signatures', () => {
      const input = [
        { role: 'user', parts: [{ text: 'What is the weather in Boston?' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: 'get_weather',
                args: { location: 'Boston' },
              },
              thoughtSignature: 'signed-thought',
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-1',
                name: 'get_weather',
                response: { result: 'Sunny' },
                parts: [
                  {
                    fileData: {
                      mimeType: 'image/jpeg',
                      fileUri: 'gs://test-bucket/weather.jpg',
                      displayName: 'weather.jpg',
                    },
                  },
                ],
              },
            },
          ],
        },
      ];

      expect(maybeCoerceToGeminiFormat(input)).toEqual({
        contents: input,
        coerced: false,
        systemInstruction: undefined,
      });
    });

    it('should coerce OpenAI chat format to GeminiFormat', () => {
      const input = [
        { role: 'user', content: 'Hello' },
        { role: 'user', content: ', ' },
        { role: 'user', content: 'Gemini!' },
      ];
      const expected = [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
        {
          role: 'user',
          parts: [{ text: ', ' }],
        },
        {
          role: 'user',
          parts: [{ text: 'Gemini!' }],
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: expected,
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should coerce string input to GeminiFormat', () => {
      const input = 'Hello, Gemini!';
      const expected = [
        {
          parts: [{ text: 'Hello, Gemini!' }],
        },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: expected,
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle system messages and create systemInstruction', () => {
      const input = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello!' }],
          },
        ],
        coerced: true,
        systemInstruction: {
          parts: [{ text: 'You are a helpful assistant.' }],
        },
      });
    });

    it('should convert system-only prompts to user messages', () => {
      const input = [{ role: 'system', content: 'You are a helpful assistant.' }];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [{ role: 'user', parts: [{ text: 'You are a helpful assistant.' }] }],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should convert multiple system-only messages to single user message', () => {
      const input = [
        { role: 'system', content: 'First instruction.' },
        { role: 'system', content: 'Second instruction.' },
      ];
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'First instruction.' }, { text: 'Second instruction.' }],
          },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should log a warning and return empty array for unknown non-array formats', () => {
      const loggerSpy = vi.spyOn(logger, 'warn');
      const input = { unknownFormat: 'test' };
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: [],
        coerced: false,
        systemInstruction: undefined,
      });
      expect(loggerSpy).toHaveBeenCalledWith(`Unknown format for Gemini: ${JSON.stringify(input)}`);
    });

    it('should handle OpenAI chat format with content as an array of objects', () => {
      const input = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is {{thing}}?',
            },
          ],
        },
      ];

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: 'What is {{thing}}?',
              },
            ],
          },
        ],
        coerced: true,
        systemInstruction: {
          parts: [{ text: 'You are a helpful AI assistant.' }],
        },
      });
    });

    it('should handle string content', () => {
      const input = [
        {
          role: 'system',
          content: 'You are a helpful AI assistant.',
        },
        {
          role: 'user',
          content: 'What is {{thing}}?',
        },
      ];

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is {{thing}}?' }],
          },
        ],
        coerced: true,
        systemInstruction: {
          parts: [{ text: 'You are a helpful AI assistant.' }],
        },
      });
    });

    it('should handle mixed content types', () => {
      const input = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First part' },
            'Second part as string',
            { type: 'image', url: 'https://example.com/image.jpg' },
          ],
        },
      ];

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'First part' },
              { text: 'Second part as string' },
              { type: 'image', url: 'https://example.com/image.jpg' },
            ],
          },
        ],
        coerced: true,
        systemInstruction: undefined,
      });
    });

    it('should handle native Gemini format with system_instruction field', () => {
      const input = {
        system_instruction: { parts: [{ text: 'You are a helpful assistant' }] },
        contents: [
          {
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            parts: [{ text: 'Hello' }],
          },
        ],
        coerced: true,
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
      });
    });

    it('should handle native Gemini format with system_instruction but no contents field', () => {
      const input = {
        system_instruction: { parts: [{ text: 'You are a helpful assistant' }] },
      };

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [],
        coerced: true,
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
      });
    });

    it('should handle native Gemini format with system_instruction and empty contents array', () => {
      const input = {
        system_instruction: { parts: [{ text: 'You are a helpful assistant' }] },
        contents: [],
      };

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [],
        coerced: true,
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
      });
    });

    it('should handle valid GeminiFormat array with system_instruction field', () => {
      const input = {
        system_instruction: { parts: [{ text: 'You are a helpful assistant' }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, Gemini!' }],
          },
        ],
      };

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello, Gemini!' }],
          },
        ],
        coerced: true,
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
      });
    });

    it('should handle system_instruction with different formats', () => {
      const input = {
        system_instruction: {
          parts: [{ text: 'You are a helpful assistant' }, { text: 'Be concise and accurate' }],
        },
        contents: [
          {
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const result = maybeCoerceToGeminiFormat(input);

      expect(result).toEqual({
        contents: [
          {
            parts: [{ text: 'Hello' }],
          },
        ],
        coerced: true,
        systemInstruction: {
          parts: [{ text: 'You are a helpful assistant' }, { text: 'Be concise and accurate' }],
        },
      });
    });
  });

  describe('getGoogleClient', () => {
    beforeEach(() => {
      // Just reset mock state, don't use vi.resetModules() as it breaks dynamic import mocks
      vi.clearAllMocks();

      // Reset mock to default state
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockClear();
      mockAuthInstance.getProjectId.mockClear();
      mockAuthInstance.getClient.mockResolvedValue({ name: 'mockClient' });
      mockAuthInstance.getProjectId.mockResolvedValue('test-project');
    });

    it('should create and return Google client', async () => {
      const mockClient = { name: 'mockClient' };
      const mockProjectId = 'test-project';

      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockResolvedValue(mockClient);
      mockAuthInstance.getProjectId.mockResolvedValue(mockProjectId);

      const { getGoogleClient } = await import('../../../src/providers/google/util');

      const result = await getGoogleClient();
      expect(result).toEqual({
        client: mockClient,
        projectId: mockProjectId,
      });
    });

    it('should create new auth client per call (SDK aligned, no global cache)', async () => {
      const mockClient = { name: 'mockClient' };
      const mockProjectId = 'test-project';

      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockResolvedValue(mockClient);
      mockAuthInstance.getProjectId.mockResolvedValue(mockProjectId);

      const { getGoogleClient } = await import('../../../src/providers/google/util');

      // Clear call count to start fresh
      googleAuthMock.GoogleAuth.mockClear();

      await getGoogleClient();
      const googleAuthCalls = googleAuthMock.GoogleAuth.mock.calls.length;

      await getGoogleClient();
      // Per SDK alignment, we no longer cache auth globally - each call creates new instance
      // This matches @google/genai SDK behavior where auth is per-instance, not global
      expect(googleAuthMock.GoogleAuth.mock.calls).toHaveLength(googleAuthCalls + 1);
    });
  });

  describe('hasGoogleDefaultCredentials', () => {
    beforeEach(() => {
      // Just reset mock state, don't use vi.resetModules() as it breaks dynamic import mocks
      vi.clearAllMocks();

      // Reset mock to default state
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockClear();
      mockAuthInstance.getProjectId.mockClear();
      mockAuthInstance.getClient.mockResolvedValue({});
      mockAuthInstance.getProjectId.mockResolvedValue('test-project');
    });

    it('should return true when credentials are available', async () => {
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockResolvedValue({});
      mockAuthInstance.getProjectId.mockResolvedValue('test-project');

      const { hasGoogleDefaultCredentials } = await import('../../../src/providers/google/util');

      const result = await hasGoogleDefaultCredentials();
      expect(result).toBe(true);
    });
  });

  describe('loadFile', () => {
    it('should load from variable', async () => {
      nunjucks.configure({ autoescape: false });

      const config_var = '{{tool_file}}';
      const context_vars = {
        tool_file:
          '[\n' +
          '  {\n' +
          '    "functionDeclarations": [\n' +
          '      {\n' +
          '        "name": "fakeTool",\n' +
          '        "description": "fake tool description"\n' +
          '      }\n' +
          '    ]\n' +
          '  }\n' +
          ']',
      };
      const result = loadFile(config_var, context_vars);
      expect(result).toEqual(JSON.parse(context_vars.tool_file));
    });

    it('should load directly from provider', async () => {
      const config_var = 'file://fp.json';
      const tools =
        '[\n' +
        '  {\n' +
        '    "functionDeclarations": [\n' +
        '      {\n' +
        '        "name": "fakeTool",\n' +
        '        "description": "fake tool description"\n' +
        '      }\n' +
        '    ]\n' +
        '  }\n' +
        ']';
      const context_vars = {};

      // existsSync no longer called due to TOCTOU fix
      vi.spyOn(fs, 'readFileSync').mockReturnValue(tools);
      const result = loadFile(config_var, context_vars);
      expect(result).toEqual(JSON.parse(tools));
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('fp.json'), 'utf8');
    });
  });

  describe('geminiFormatSystemInstructions', () => {
    it('should handle system messages in prompt', async () => {
      const prompt = [
        { role: 'system', content: [{ text: 'system instruction' }] },
        { role: 'user', content: [{ text: 'user message' }] },
      ];

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        undefined,
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    });

    it('should handle system messages in config', async () => {
      const prompt = [{ role: 'user', parts: [{ text: 'user message' }] }];

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        { parts: [{ text: 'system instruction' }] },
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    });

    it('should handle system messages in variables', async () => {
      const prompt = [{ role: 'user', parts: [{ text: 'user message' }] }];

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        { system_instruction: 'system instruction' },
        { parts: [{ text: '{{system_instruction}}' }] },
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    });

    it('should handle string system messages in config', async () => {
      const prompt = [{ role: 'user', parts: [{ text: 'user message' }] }];

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        'system instruction',
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    });

    it('should handle filepath system messages in variables', async () => {
      const prompt = [{ role: 'user', parts: [{ text: 'user message' }] }];
      const system_instruction = JSON.stringify({ parts: [{ text: 'system instruction' }] });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(system_instruction);

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        { system_instruction: 'file://system_instruction.json' },
        '{{system_instruction}}',
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
    });

    it('should merge system messages from both prompt and config with string config', () => {
      const prompt = [
        { role: 'system', content: 'prompt system instruction' },
        { role: 'user', content: 'user message' },
      ];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        'config system instruction',
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({
        parts: [{ text: 'config system instruction' }, { text: 'prompt system instruction' }],
      });
    });

    it('should merge system messages from both prompt and config with object config', () => {
      const prompt = [
        { role: 'system', content: 'prompt system instruction' },
        { role: 'user', content: 'user message' },
      ];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        { parts: [{ text: 'config system instruction' }] },
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({
        parts: [{ text: 'config system instruction' }, { text: 'prompt system instruction' }],
      });
    });

    it('should merge multiple parts from config systemInstruction', () => {
      const prompt = [
        { role: 'system', content: 'prompt system instruction' },
        { role: 'user', content: 'user message' },
      ];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        {
          parts: [{ text: 'config system instruction 1' }, { text: 'config system instruction 2' }],
        },
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({
        parts: [
          { text: 'config system instruction 1' },
          { text: 'config system instruction 2' },
          { text: 'prompt system instruction' },
        ],
      });
    });

    it('should merge multiple system messages from prompt', () => {
      const prompt = [
        { role: 'system', content: 'prompt system instruction 1' },
        { role: 'system', content: 'prompt system instruction 2' },
        { role: 'user', content: 'user message' },
      ];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        'config system instruction',
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({
        parts: [
          { text: 'config system instruction' },
          { text: 'prompt system instruction 1' },
          { text: 'prompt system instruction 2' },
        ],
      });
    });

    it('should render Nunjucks templates in config systemInstruction', () => {
      const prompt = [{ role: 'user', content: 'user message' }];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        { role: 'a helpful assistant', language: 'Japanese' },
        'You are {{role}}. Respond in {{language}}.',
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({
        parts: [{ text: 'You are a helpful assistant. Respond in Japanese.' }],
      });
    });

    it('should skip empty string config systemInstruction', () => {
      const prompt = [
        { role: 'system', content: 'prompt system instruction' },
        { role: 'user', content: 'user message' },
      ];
      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        {},
        '',
      );
      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      // Empty string is falsy, so config systemInstruction is not processed
      expect(systemInstruction).toEqual({
        parts: [{ text: 'prompt system instruction' }],
      });
    });

    describe('support for images in contents', () => {
      const validBase64Image =
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A/9k=';

      it('should preserve text formatting when no images are present', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: 'Hello world!\n\n  This is indented text.\n\nAnd this has multiple\n\n\nEmpty lines.',
              },
            ],
          },
        ]);

        const contextVars = {
          someVar: 'not an image',
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Hello world!\n\n  This is indented text.\n\nAnd this has multiple\n\n\nEmpty lines.',
              },
            ],
          },
        ]);
      });

      it('should preserve text formatting when no context variables are provided', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: 'Hello world!\n\n  This is indented text.\n\nAnd this has multiple\n\n\nEmpty lines.',
              },
            ],
          },
        ]);

        const { contents } = geminiFormatAndSystemInstructions(prompt);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Hello world!\n\n  This is indented text.\n\nAnd this has multiple\n\n\nEmpty lines.',
              },
            ],
          },
        ]);
      });

      it('should convert base64 images from context variables while preserving other text', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: `Here is some text before the image:\n\n${validBase64Image}\n\nAnd here is some text after the image.`,
              },
            ],
          },
        ]);

        const contextVars = {
          image1: validBase64Image,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Here is some text before the image:\n',
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: validBase64Image,
                },
              },
              {
                text: 'And here is some text after the image.',
              },
            ],
          },
        ]);
      });

      it('should handle multiple images mixed with text', () => {
        const image1 = validBase64Image;
        const image2 =
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA5w5EQwA7BHigu/QKBgAAAABJRU5ErkJggg==';

        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: `First line of text.\n${image1}\nMiddle text line.\n${image2}\nLast line of text.`,
              },
            ],
          },
        ]);

        const contextVars = {
          image1: image1,
          image2: image2,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'First line of text.',
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: image1,
                },
              },
              {
                text: 'Middle text line.',
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: image2,
                },
              },
              {
                text: 'Last line of text.',
              },
            ],
          },
        ]);
      });

      it('should preserve complex formatting with whitespace and empty lines', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: 'Title\n\n    Indented paragraph with spaces\n\n\n    Another indented paragraph\n        with more indentation\n\n',
              },
            ],
          },
        ]);

        const contextVars = {
          notAnImage: 'just text',
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Title\n\n    Indented paragraph with spaces\n\n\n    Another indented paragraph\n        with more indentation\n\n',
              },
            ],
          },
        ]);
      });

      it('should handle edge case with image at the beginning', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: `${validBase64Image}\nText after image`,
              },
            ],
          },
        ]);

        const contextVars = {
          image1: validBase64Image,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: validBase64Image,
                },
              },
              {
                text: 'Text after image',
              },
            ],
          },
        ]);
      });

      it('should handle edge case with image at the end', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: `Text before image\n${validBase64Image}`,
              },
            ],
          },
        ]);

        const contextVars = {
          image1: validBase64Image,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Text before image',
              },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: validBase64Image,
                },
              },
            ],
          },
        ]);
      });

      it('should handle non-text parts without modification', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: 'Some text',
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'existing-image-data',
                },
              },
            ],
          },
        ]);

        const contextVars = {
          image1: validBase64Image,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Some text',
              },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: 'existing-image-data',
                },
              },
            ],
          },
        ]);
      });

      it('should handle empty text parts', () => {
        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: '',
              },
            ],
          },
        ]);

        const contextVars = {
          image1: validBase64Image,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: '',
              },
            ],
          },
        ]);
      });

      it('should correctly detect and process WebP images', () => {
        // WebP file starts with "RIFF" (UklGR in base64) followed by file size
        // This is a longer base64 string to meet the 100 character minimum requirement
        const webpBase64 =
          'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

        const prompt = JSON.stringify([
          {
            role: 'user',
            parts: [
              {
                text: `Here is a WebP image:\n${webpBase64}\nEnd of image.`,
              },
            ],
          },
        ]);

        const contextVars = {
          webpImage: webpBase64,
        };

        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

        expect(contents).toEqual([
          {
            role: 'user',
            parts: [
              {
                text: 'Here is a WebP image:',
              },
              {
                inlineData: {
                  mimeType: 'image/webp',
                  data: webpBase64,
                },
              },
              {
                text: 'End of image.',
              },
            ],
          },
        ]);
      });

      it('should correctly detect WebP images with variable file sizes', () => {
        // Different valid WebP base64 strings that start with UklGR (not UklGRg)
        // These represent "RIFF" followed by different file size bytes
        // Each is padded to be over 100 characters to meet the minimum requirement
        const webpVariants = [
          'UklGRjAAAABXRUJQVlA4IBQAAAAwAQCdASoBAAEAAQAcJaACdLoB/AAAA0AA/v359OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
          'UklGRkAAAABXRUJQVlA4IEQAAAAwAgCdASoCAAIAAQAcJaACdLoD/AAAA8AAAAj17Zs+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          'UklGRlAAAABXRUJQVlA4IEQAAAAwAgCdASoCAAIAAQAcJaACdLoD/AAAA8AAAAj17Zs+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        ];

        webpVariants.forEach((webpData, index) => {
          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: webpData,
                },
              ],
            },
          ]);

          const contextVars = {
            [`webpImage${index}`]: webpData,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents[0].parts).toEqual([
            {
              inlineData: {
                mimeType: 'image/webp',
                data: webpData,
              },
            },
          ]);
        });
      });

      describe('data URL support', () => {
        const asfHeader = Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex');
        const asfStreamProperties = Buffer.from('9107dcb7b7a9cf118ee600c00c205365', 'hex');
        const asfVideoStream = Buffer.from('c0ef19bc4d5bcf11a8fd00805f5c442b', 'hex');
        const asfAudioStream = Buffer.from('409e69f84d5bcf11a8fd00805f5c442b', 'hex');
        const wmvBase64 = Buffer.concat([
          asfHeader,
          asfStreamProperties,
          Buffer.alloc(8),
          asfVideoStream,
        ]).toString('base64');
        const wmaBase64 = Buffer.concat([
          asfHeader,
          asfStreamProperties,
          Buffer.alloc(8),
          asfAudioStream,
        ]).toString('base64');
        const webmBase64 = Buffer.from('1a45dfa3a34282847765626d00000000', 'hex').toString(
          'base64',
        );
        const matroskaBase64 = Buffer.from(
          '1a45dfa3a34282886d6174726f736b6100000000',
          'hex',
        ).toString('base64');

        it.each([
          ['application/pdf', Buffer.from('%PDF-1.7\n1 0 obj\n').toString('base64')],
          ['audio/wav', Buffer.from('RIFF....WAVEfmt ........').toString('base64')],
          ['audio/aiff', Buffer.from('FORM....AIFFCOMM........').toString('base64')],
          ['audio/mpeg', Buffer.from('ID3.................').toString('base64')],
          ['audio/aac', Buffer.from('fff15080000000000000000000000000', 'hex').toString('base64')],
          ['audio/mp4', Buffer.from('....ftypM4A ........').toString('base64')],
          ['image/heic', Buffer.from('....ftypheic........').toString('base64')],
          ['image/heif', Buffer.from('....ftypmif1........').toString('base64')],
          ['video/mp4', Buffer.from('....ftypisom........').toString('base64')],
          ['video/quicktime', Buffer.from('....ftypqt  ........').toString('base64')],
          ['video/3gpp', Buffer.from('....ftyp3gp5........').toString('base64')],
          ['video/mpeg', Buffer.from('000001ba000000000000000000000000', 'hex').toString('base64')],
          ['video/x-flv', Buffer.from('FLV\u0001................').toString('base64')],
          ['video/wmv', wmvBase64],
          ['video/webm', webmBase64],
          [
            'video/ogg',
            Buffer.from('4f6767530000000000000000807468656f72610000000000', 'hex').toString(
              'base64',
            ),
          ],
        ])('should convert %s data URLs to Gemini inline data', (mimeType, base64Data) => {
          const dataUrl = `data:${mimeType};base64,${base64Data}`;
          const prompt = JSON.stringify([{ role: 'user', parts: [{ text: dataUrl }] }]);

          const { contents } = geminiFormatAndSystemInstructions(prompt, { media: dataUrl });

          expect(contents[0].parts).toEqual([{ inlineData: { mimeType, data: base64Data } }]);
        });

        it.each([
          ['application/pdf', Buffer.from('%PDF-1.7\n1 0 obj\n').toString('base64')],
          ['audio/wav', Buffer.from('RIFF....WAVEfmt ........').toString('base64')],
          ['audio/aiff', Buffer.from('FORM....AIFCCOMM........').toString('base64')],
          ['audio/mpeg', Buffer.from('ID3.................').toString('base64')],
          ['audio/aac', Buffer.from('fff15080000000000000000000000000', 'hex').toString('base64')],
          ['audio/aac', Buffer.from('fff05080000000000000000000000000', 'hex').toString('base64')],
          ['audio/aac', Buffer.from('fff85080000000000000000000000000', 'hex').toString('base64')],
          ['audio/aac', Buffer.from('fff95080000000000000000000000000', 'hex').toString('base64')],
          ['audio/mpeg', Buffer.from('fffb5000000000000000000000000000', 'hex').toString('base64')],
          ['audio/mp4', Buffer.from('....ftypM4A ........').toString('base64')],
          ['image/heic', Buffer.from('....ftypheic........').toString('base64')],
          ['image/heif', Buffer.from('....ftypmif1........').toString('base64')],
          ['video/mp4', Buffer.from('....ftypisom........').toString('base64')],
          ['video/quicktime', Buffer.from('....ftypqt  ........').toString('base64')],
          ['video/quicktime', Buffer.from('....moov............').toString('base64')],
          ['video/quicktime', Buffer.from('....mdat............').toString('base64')],
          ['video/quicktime', Buffer.from('....wide............').toString('base64')],
          ['video/3gpp', Buffer.from('....ftyp3gp5........').toString('base64')],
          ['video/mpeg', Buffer.from('000001b3000000000000000000000000', 'hex').toString('base64')],
          ['video/x-flv', Buffer.from('FLV\u0001................').toString('base64')],
          ['video/wmv', wmvBase64],
          ['audio/x-ms-wma', wmaBase64],
          ['video/webm', webmBase64],
          [
            'video/ogg',
            Buffer.from('4f6767530000000000000000807468656f72610000000000', 'hex').toString(
              'base64',
            ),
          ],
        ])('should infer %s for raw base64 media loaded from a file', (mimeType, base64Data) => {
          const prompt = JSON.stringify([{ role: 'user', parts: [{ text: base64Data }] }]);

          const { contents } = geminiFormatAndSystemInstructions(prompt, { media: base64Data });

          expect(contents[0].parts).toEqual([{ inlineData: { mimeType, data: base64Data } }]);
        });

        it('does not misclassify Matroska containers as WebM', () => {
          const prompt = JSON.stringify([{ role: 'user', parts: [{ text: matroskaBase64 }] }]);

          const { contents } = geminiFormatAndSystemInstructions(prompt, { media: matroskaBase64 });

          expect(contents[0].parts).toEqual([{ text: matroskaBase64 }]);
        });

        it('sniffs only the beginning of large base64 media', () => {
          const bytes = Buffer.concat([Buffer.from('RIFF....WAVEfmt ........'), Buffer.alloc(1e6)]);
          const base64Data = bytes.toString('base64');
          const fromSpy = vi.spyOn(Buffer, 'from');

          try {
            const prompt = JSON.stringify([{ role: 'user', parts: [{ text: base64Data }] }]);
            const { contents } = geminiFormatAndSystemInstructions(prompt, { media: base64Data });

            expect(contents[0].parts).toEqual([
              { inlineData: { mimeType: 'audio/wav', data: base64Data } },
            ]);
            expect(fromSpy.mock.calls.some(([value]) => value === base64Data)).toBe(false);
          } finally {
            fromSpy.mockRestore();
          }
        });

        it('should handle JPEG data URLs and extract base64', () => {
          const base64Data = validBase64Image;
          const dataUrl = `data:image/jpeg;base64,${base64Data}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: `Here is an image:\n${dataUrl}\nEnd of image.`,
                },
              ],
            },
          ]);

          const contextVars = {
            image1: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents).toEqual([
            {
              role: 'user',
              parts: [
                {
                  text: 'Here is an image:',
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data, // Should extract raw base64
                  },
                },
                {
                  text: 'End of image.',
                },
              ],
            },
          ]);
        });

        it('should handle PNG data URLs', () => {
          const base64Data =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA5w5EQwA7BHigu/QKBgAAAABJRU5ErkJggg==';
          const dataUrl = `data:image/png;base64,${base64Data}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: dataUrl,
                },
              ],
            },
          ]);

          const contextVars = {
            image1: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents[0].parts).toEqual([
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Data,
              },
            },
          ]);
        });

        it('should handle GIF data URLs', () => {
          const base64Data =
            'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
          const dataUrl = `data:image/gif;base64,${base64Data}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: dataUrl,
                },
              ],
            },
          ]);

          const contextVars = {
            image1: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents[0].parts).toEqual([
            {
              inlineData: {
                mimeType: 'image/gif',
                data: base64Data,
              },
            },
          ]);
        });

        it('should handle WebP data URLs', () => {
          const base64Data =
            'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vuUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
          const dataUrl = `data:image/webp;base64,${base64Data}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: dataUrl,
                },
              ],
            },
          ]);

          const contextVars = {
            image1: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents[0].parts).toEqual([
            {
              inlineData: {
                mimeType: 'image/webp',
                data: base64Data,
              },
            },
          ]);
        });

        it('should handle mixed data URLs and raw base64', () => {
          const rawBase64 = validBase64Image;
          const dataUrlBase64 =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAGA5w5EQwA7BHigu/QKBgAAAABJRU5ErkJggg==';
          const dataUrl = `data:image/png;base64,${dataUrlBase64}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: `Raw image:\n${rawBase64}\nData URL image:\n${dataUrl}\nEnd.`,
                },
              ],
            },
          ]);

          const contextVars = {
            rawImage: rawBase64,
            dataUrlImage: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents).toEqual([
            {
              role: 'user',
              parts: [
                {
                  text: 'Raw image:',
                },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: rawBase64,
                  },
                },
                {
                  text: 'Data URL image:',
                },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: dataUrlBase64, // Should extract raw base64 from data URL
                  },
                },
                {
                  text: 'End.',
                },
              ],
            },
          ]);
        });

        it('should preserve MIME type from data URL when available', () => {
          // Test that MIME type from data URL takes precedence over magic number detection
          const base64Data = validBase64Image;
          // Use a different MIME type in data URL (though this would be unusual in practice)
          const dataUrl = `data:image/jpeg;base64,${base64Data}`;

          const prompt = JSON.stringify([
            {
              role: 'user',
              parts: [
                {
                  text: dataUrl,
                },
              ],
            },
          ]);

          const contextVars = {
            image1: dataUrl,
          };

          const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);

          expect(contents[0].parts[0]).toMatchObject({
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          });
        });
      });
    });

    describe('edge cases for contents array handling', () => {
      it('should handle empty contents array', () => {
        const prompt = JSON.stringify([]);
        const { contents } = geminiFormatAndSystemInstructions(prompt);
        expect(Array.isArray(contents)).toBe(true);
        expect(contents).toEqual([]);
      });

      it('should handle malformed prompt that results in empty array gracefully', () => {
        // This tests the defensive guard in processImagesInContents
        // by ensuring the function doesn't crash even with edge cases
        const prompt = 'invalid json that cannot be parsed';
        // parseChatPrompt will handle this and return a default format
        const { contents } = geminiFormatAndSystemInstructions(prompt);
        expect(Array.isArray(contents)).toBe(true);
        // Should have at least one element with the prompt text
        expect(contents.length).toBeGreaterThan(0);
      });

      it('should handle empty array with contextVars without error', () => {
        const prompt = JSON.stringify([]);
        const contextVars = {
          image1:
            '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A/9k=',
        };
        const { contents } = geminiFormatAndSystemInstructions(prompt, contextVars);
        expect(Array.isArray(contents)).toBe(true);
        expect(contents).toEqual([]);
      });
    });
  });

  describe('normalizeTools', () => {
    it('should convert snake_case to camelCase for tool properties', () => {
      const tools = [
        {
          google_search: {},
        } as any,
        {
          code_execution: {},
        } as any,
        {
          google_search_retrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0,
            },
          },
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized).toEqual([
        {
          google_search: {},
          googleSearch: {},
        },
        {
          code_execution: {},
          codeExecution: {},
        },
        {
          google_search_retrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0,
            },
          },
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0,
            },
          },
        },
      ]);
    });

    it('should not override existing camelCase properties', () => {
      const tools = [
        {
          google_search: { property1: 'value1' },
          googleSearch: { property2: 'value2' },
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized).toEqual([
        {
          google_search: { property1: 'value1' },
          googleSearch: { property2: 'value2' },
        },
      ]);
    });

    it('should leave other properties unchanged', () => {
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'testFunction',
              description: 'A test function',
            },
          ],
          google_search: {},
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized).toEqual([
        {
          functionDeclarations: [
            {
              name: 'testFunction',
              description: 'A test function',
            },
          ],
          google_search: {},
          googleSearch: {},
        },
      ]);
    });

    it('should handle empty arrays', () => {
      const tools: any[] = [];
      const normalized = normalizeTools(tools);
      expect(normalized).toEqual([]);
    });

    it('should sanitize function declaration schemas by removing additionalProperties', () => {
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'test_tool',
              description: 'A test tool',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                additionalProperties: false, // Should be removed
              },
            },
          ],
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized[0].functionDeclarations![0].parameters).not.toHaveProperty(
        'additionalProperties',
      );
      expect(normalized[0].functionDeclarations![0].parameters).toEqual({
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING' },
        },
      });
    });

    it('should sanitize nested schemas in function declarations', () => {
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'nested_tool',
              parameters: {
                type: 'object',
                properties: {
                  options: {
                    type: 'object',
                    properties: {
                      value: { type: 'number', default: 10 },
                    },
                    additionalProperties: false,
                  },
                },
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
        } as any,
      ];

      const normalized = normalizeTools(tools);

      const params = normalized[0].functionDeclarations![0].parameters as any;
      expect(params).not.toHaveProperty('additionalProperties');
      expect(params).not.toHaveProperty('$schema');
      expect(params.properties.options).not.toHaveProperty('additionalProperties');
      expect(params.properties.options.properties.value).not.toHaveProperty('default');
    });

    it('should handle tools without functionDeclarations', () => {
      const tools = [
        {
          googleSearch: {},
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized).toEqual([
        {
          googleSearch: {},
        },
      ]);
    });

    it('should handle functionDeclarations without parameters', () => {
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'no_params_tool',
              description: 'Tool without parameters',
            },
          ],
        } as any,
      ];

      const normalized = normalizeTools(tools);

      expect(normalized[0].functionDeclarations![0]).toEqual({
        name: 'no_params_tool',
        description: 'Tool without parameters',
        parameters: undefined,
      });
    });
  });

  describe('resolveProjectId', () => {
    const mockProjectId = 'google-auth-project';

    beforeEach(async () => {
      // Clear the cached GoogleAuth instance before each test
      clearCachedAuth();

      // Stub environment variables to prevent Google Auth Library from reading local gcloud config
      vi.stubEnv('VERTEX_PROJECT_ID', undefined);
      vi.stubEnv('GOOGLE_PROJECT_ID', undefined);
      vi.stubEnv('GCLOUD_PROJECT', undefined);
      vi.stubEnv('GOOGLE_CLOUD_PROJECT', undefined);
      vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', undefined);
      vi.stubEnv('CLOUDSDK_CONFIG', undefined);
      vi.stubEnv('CLOUDSDK_CORE_PROJECT', undefined);

      // Don't use vi.resetModules() - it breaks the mock for dynamic imports
      // Instead, just reset the mock state
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockClear();
      mockAuthInstance.fromJSON.mockClear();
      mockAuthInstance.getProjectId.mockClear();

      mockAuthInstance.getClient.mockResolvedValue({ name: 'mockClient' });
      mockAuthInstance.fromJSON.mockImplementation((credentials: any) => {
        return Promise.resolve({ name: 'mockCredentialClient', credentials });
      });
      mockAuthInstance.getProjectId.mockResolvedValue(mockProjectId);
    });

    afterEach(() => {
      // Restore environment variables
      vi.unstubAllEnvs();
    });

    it('should prioritize explicit config over environment variables', async () => {
      const config = { projectId: 'explicit-project' };
      const env = { VERTEX_PROJECT_ID: 'env-project' };

      const result = await resolveProjectId(config, env);
      expect(result).toBe('explicit-project');
    });

    it('should use environment variables when no explicit config', async () => {
      const config = {};
      const env = { VERTEX_PROJECT_ID: 'env-project' };

      const result = await resolveProjectId(config, env);
      expect(result).toBe('env-project');
    });

    it('should fall back to Google Auth Library when no config or env vars', async () => {
      clearCachedAuth();
      const { mockAuthInstance } = googleAuthMock;

      const config = {};
      const env = {};

      const result = await resolveProjectId(config, env);

      // Verify the mock was called - this confirms our mock isolation is working
      expect(mockAuthInstance.getProjectId).toHaveBeenCalled();
      expect(result).toBe(mockProjectId);
    });

    it('should handle Google Auth Library getProjectId failure gracefully', async () => {
      // Override mock to make getProjectId fail
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getClient.mockResolvedValue({ name: 'mockClient' });
      mockAuthInstance.fromJSON.mockResolvedValue({ name: 'mockCredentialClient' });
      mockAuthInstance.getProjectId.mockRejectedValue(
        new Error('Unable to detect a Project Id in the current environment'),
      );

      // Test that explicit config projectId is still used even when getProjectId fails
      const config = {
        projectId: 'explicit-project',
        credentials: '{"type": "service_account", "project_id": "creds-project"}',
      };
      const env = {};

      const result = await resolveProjectId(config, env);
      expect(result).toBe('explicit-project');

      // Verify that getProjectId was called but failed gracefully
      expect(mockAuthInstance.getProjectId).toHaveBeenCalled();
      expect(mockAuthInstance.fromJSON).toHaveBeenCalled();
    });

    it('should return empty string when all sources fail', async () => {
      // Override the mock to make getProjectId fail
      const { mockAuthInstance } = googleAuthMock;
      mockAuthInstance.getProjectId.mockRejectedValue(
        new Error('Unable to detect a Project Id in the current environment'),
      );

      // Test that when no projectId is available anywhere, we get empty string
      const config = {};
      const env = {};

      const result = await resolveProjectId(config, env);

      expect(result).toBe('');
      // Verify that getProjectId was called but failed gracefully
      expect(mockAuthInstance.getProjectId).toHaveBeenCalled();
    });
  });

  describe('sanitizeSchemaForGemini', () => {
    it('should remove additionalProperties from schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).toEqual({
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
        },
      });
      expect(result).not.toHaveProperty('additionalProperties');
    });

    it('should remove $schema from schema', () => {
      const schema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).not.toHaveProperty('$schema');
      expect(result).toEqual({
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
        },
      });
    });

    it('should remove default values from schema', () => {
      const schema = {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            default: 10,
          },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result.properties.count).not.toHaveProperty('default');
      expect(result).toEqual({
        type: 'OBJECT',
        properties: {
          count: { type: 'NUMBER' },
        },
      });
    });

    it('should convert lowercase types to uppercase', () => {
      const schema = {
        type: 'object',
        properties: {
          str: { type: 'string' },
          num: { type: 'number' },
          int: { type: 'integer' },
          bool: { type: 'boolean' },
          arr: { type: 'array', items: { type: 'string' } },
          obj: { type: 'object', properties: {} },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result.type).toBe('OBJECT');
      expect(result.properties.str.type).toBe('STRING');
      expect(result.properties.num.type).toBe('NUMBER');
      expect(result.properties.int.type).toBe('INTEGER');
      expect(result.properties.bool.type).toBe('BOOLEAN');
      expect(result.properties.arr.type).toBe('ARRAY');
      expect(result.properties.obj.type).toBe('OBJECT');
    });

    it('should preserve already uppercase types', () => {
      const schema = {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result.type).toBe('OBJECT');
      expect(result.properties.name.type).toBe('STRING');
    });

    it('should recursively sanitize nested properties', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', default: 'unknown' },
              address: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                },
              },
            },
          },
        },
        additionalProperties: false,
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).not.toHaveProperty('additionalProperties');
      expect(result.properties.user).not.toHaveProperty('additionalProperties');
      expect(result.properties.user.properties.name).not.toHaveProperty('default');
      expect(result.properties.user.properties.address).not.toHaveProperty('additionalProperties');

      expect(result.type).toBe('OBJECT');
      expect(result.properties.user.type).toBe('OBJECT');
      expect(result.properties.user.properties.address.type).toBe('OBJECT');
      expect(result.properties.user.properties.address.properties.street.type).toBe('STRING');
    });

    it('should recursively sanitize array items', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            tags: {
              type: 'array',
              items: { type: 'string', default: '' },
            },
          },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result.items).not.toHaveProperty('additionalProperties');
      expect(result.items.properties.tags.items).not.toHaveProperty('default');

      expect(result.type).toBe('ARRAY');
      expect(result.items.type).toBe('OBJECT');
      expect(result.items.properties.id.type).toBe('STRING');
      expect(result.items.properties.tags.type).toBe('ARRAY');
      expect(result.items.properties.tags.items.type).toBe('STRING');
    });

    it('should preserve supported Gemini schema properties', () => {
      const schema = {
        type: 'object',
        format: 'date-time',
        description: 'A user object',
        nullable: true,
        enum: ['a', 'b', 'c'],
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'User name' },
        },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).toEqual({
        type: 'OBJECT',
        format: 'date-time',
        description: 'A user object',
        nullable: true,
        enum: ['a', 'b', 'c'],
        required: ['name'],
        properties: {
          name: { type: 'STRING', description: 'User name' },
        },
      });
    });

    it('should preserve minItems and maxItems for arrays', () => {
      const schema = {
        type: 'array',
        minItems: 1,
        maxItems: 10,
        items: { type: 'string' },
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).toEqual({
        type: 'ARRAY',
        minItems: 1,
        maxItems: 10,
        items: { type: 'STRING' },
      });
    });

    it('should handle real MCP SDK Zod-generated schema', () => {
      // This represents what MCP SDK generates from Zod schemas
      const mcpZodSchema = {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to analyze',
          },
          maxTokens: {
            type: 'number',
            description: 'Maximum tokens to generate',
            default: 1000,
          },
          options: {
            type: 'object',
            properties: {
              temperature: {
                type: 'number',
                default: 0.7,
              },
              topK: {
                type: 'integer',
              },
            },
            additionalProperties: false,
          },
        },
        required: ['prompt'],
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
      };

      const result = sanitizeSchemaForGemini(mcpZodSchema);

      // Should not have any unsupported properties
      expect(result).not.toHaveProperty('$schema');
      expect(result).not.toHaveProperty('additionalProperties');
      expect(result.properties.maxTokens).not.toHaveProperty('default');
      expect(result.properties.options).not.toHaveProperty('additionalProperties');
      expect(result.properties.options.properties.temperature).not.toHaveProperty('default');

      // Should have all supported properties with correct types
      expect(result).toEqual({
        type: 'OBJECT',
        properties: {
          prompt: {
            type: 'STRING',
            description: 'The prompt to analyze',
          },
          maxTokens: {
            type: 'NUMBER',
            description: 'Maximum tokens to generate',
          },
          options: {
            type: 'OBJECT',
            properties: {
              temperature: {
                type: 'NUMBER',
              },
              topK: {
                type: 'INTEGER',
              },
            },
          },
        },
        required: ['prompt'],
      });
    });

    it('should handle null or undefined schema gracefully', () => {
      expect(sanitizeSchemaForGemini(null as any)).toBe(null);
      expect(sanitizeSchemaForGemini(undefined as any)).toBe(undefined);
    });

    it('should handle empty schema object', () => {
      const schema = {};

      const result = sanitizeSchemaForGemini(schema);

      expect(result).toEqual({});
    });

    it('should handle null type mapping', () => {
      // Gemini doesn't support null type directly, map to STRING
      const schema = {
        type: 'null',
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result.type).toBe('STRING');
    });

    it('should remove anyOf, oneOf, allOf (not supported by Gemini)', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            anyOf: [{ type: 'string' }, { type: 'number' }],
          },
        },
        oneOf: [{ type: 'object' }],
        allOf: [{ required: ['name'] }],
      };

      const result = sanitizeSchemaForGemini(schema);

      expect(result).not.toHaveProperty('anyOf');
      expect(result).not.toHaveProperty('oneOf');
      expect(result).not.toHaveProperty('allOf');
      // The nested anyOf in value property should also be removed
      expect(result.properties.value).not.toHaveProperty('anyOf');
    });
  });

  describe('calculateGoogleCost', () => {
    it('should return undefined for missing token counts', () => {
      expect(calculateGoogleCost('gemini-pro', {}, undefined, 100)).toBeUndefined();
      expect(calculateGoogleCost('gemini-pro', {}, 100, undefined)).toBeUndefined();
      expect(calculateGoogleCost('gemini-pro', {}, undefined, undefined)).toBeUndefined();
    });

    it('should return undefined for unknown models', () => {
      expect(calculateGoogleCost('unknown-model', {}, 100, 50)).toBeUndefined();
    });

    it('should calculate cost for gemini-pro model', () => {
      // gemini-pro: input=0.5/1M, output=1.5/1M
      const cost = calculateGoogleCost('gemini-pro', {}, 1000, 500);
      // Expected: (1000 * 0.5 + 500 * 1.5) / 1M = (500 + 750) / 1M = 0.00125
      expect(cost).toBeCloseTo(0.00125, 10);
    });

    it('should calculate cost for gemini-2.0-flash model', () => {
      // gemini-2.0-flash: input=0.1/1M, output=0.4/1M
      const cost = calculateGoogleCost('gemini-2.0-flash', {}, 10000, 5000);
      // Expected: (10000 * 0.1 + 5000 * 0.4) / 1M = (1000 + 2000) / 1M = 0.003
      expect(cost).toBeCloseTo(0.003, 10);
    });

    it('should calculate cost for gemini-2.5-flash model', () => {
      // gemini-2.5-flash: input=0.3/1M, output=2.5/1M
      const cost = calculateGoogleCost('gemini-2.5-flash', {}, 1000, 500);
      // Expected: (1000 * 0.3 + 500 * 2.5) / 1M = (300 + 1250) / 1M = 0.00155
      expect(cost).toBeCloseTo(0.00155, 10);
    });

    it('should apply tiered pricing for gemini-3.1-pro-preview when above threshold', () => {
      // gemini-3.1-pro-preview: base input=2.0/1M, output=12.0/1M
      // tiered (>200k): input=4.0/1M, output=18.0/1M
      const costBelowThreshold = calculateGoogleCost('gemini-3.1-pro-preview', {}, 100000, 50000);
      // Expected (below 200k): (100000 * 2.0 + 50000 * 12.0) / 1M = 0.8
      expect(costBelowThreshold).toBeCloseTo(0.8, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-3.1-pro-preview', {}, 250000, 50000);
      // Expected (above 200k): (250000 * 4.0 + 50000 * 18.0) / 1M = 1.9
      expect(costAboveThreshold).toBeCloseTo(1.9, 10);
    });

    it('should apply tiered pricing for gemini-3.1-pro-preview-customtools when above threshold', () => {
      // gemini-3.1-pro-preview-customtools: base input=2.0/1M, output=12.0/1M
      // tiered (>200k): input=4.0/1M, output=18.0/1M
      const costBelowThreshold = calculateGoogleCost(
        'gemini-3.1-pro-preview-customtools',
        {},
        100000,
        50000,
      );
      expect(costBelowThreshold).toBeCloseTo(0.8, 10);

      const costAboveThreshold = calculateGoogleCost(
        'gemini-3.1-pro-preview-customtools',
        {},
        250000,
        50000,
      );
      expect(costAboveThreshold).toBeCloseTo(1.9, 10);
    });

    it('should preserve tiered pricing for gemini-3-pro-preview alias', () => {
      const cost = calculateGoogleCost('gemini-3-pro-preview', {}, 250000, 50000);
      expect(cost).toBeCloseTo(1.9, 10);
    });

    it('should calculate cost for gemini-3.1-flash-lite-preview', () => {
      // gemini-3.1-flash-lite-preview: input=0.25/1M, output=1.5/1M
      const cost = calculateGoogleCost('gemini-3.1-flash-lite-preview', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.001, 10);
    });

    it('should calculate cost for gemini-3.1-flash-lite (GA)', () => {
      // gemini-3.1-flash-lite: input=0.25/1M, output=1.5/1M
      const cost = calculateGoogleCost('gemini-3.1-flash-lite', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.001, 10);
    });

    it('should calculate cost for gemini-3.5-flash', () => {
      // gemini-3.5-flash: input=1.5/1M, output=9.0/1M
      const cost = calculateGoogleCost('gemini-3.5-flash', {}, 1000, 500);
      // Expected: (1000 * 1.5 + 500 * 9.0) / 1M = (1500 + 4500) / 1M = 0.006
      expect(cost).toBeCloseTo(0.006, 10);
    });

    it.each([
      ['gemini-3.6-flash', 0.00525],
      ['gemini-3.5-flash-lite', 0.00155],
    ])('should calculate cost for %s', (modelId, expectedCost) => {
      expect(calculateGoogleCost(modelId, {}, 1_000, 500)).toBeCloseTo(expectedCost, 10);
    });

    it('should calculate cost for gemini-omni-flash-preview', () => {
      const cost = calculateGoogleCost('gemini-omni-flash-preview', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.006, 10);
    });

    it('should use the video-output rate for gemini-omni-flash-preview', () => {
      const cost = calculateGoogleCost(
        'gemini-omni-flash-preview',
        {},
        1_000,
        600,
        false,
        undefined,
        undefined,
        500,
      );
      expect(cost).toBeCloseTo((1_000 * 1.5 + 100 * 9 + 500 * 17.5) / 1e6, 12);
    });

    it('should calculate cost for gemini-3.1-flash-live-preview', () => {
      const cost = calculateGoogleCost('gemini-3.1-flash-live-preview', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.003, 10);
    });

    it('should calculate mixed text and audio cost for gemini-3.1-flash-live-preview', () => {
      const cost = calculateGoogleCost(
        'gemini-3.1-flash-live-preview',
        {},
        1_000,
        500,
        false,
        200,
        100,
      );
      expect(cost).toBeCloseTo((800 * 0.75 + 200 * 3 + 400 * 4.5 + 100 * 12) / 1e6, 12);
    });

    it.each([
      ['gemini-live-2.5-flash-preview-native-audio-09-2025', 0.3, 2.0, 3.0, 12.0],
      ['gemini-2.5-flash-native-audio-latest', 0.5, 2.0, 3.0, 12.0],
      ['gemini-2.5-flash-native-audio-preview-09-2025', 0.3, 2.5, 1.0, 2.5],
      ['gemini-2.5-flash-native-audio-preview-12-2025', 0.5, 2.0, 3.0, 12.0],
    ])('should calculate mixed text and audio cost for %s', (id, input, output, audioInput, audioOutput) => {
      expect(calculateGoogleCost(id, {}, 1_000, 500, false, 200, 100)).toBeCloseTo(
        (800 * input + 200 * audioInput + 400 * output + 100 * audioOutput) / 1e6,
        12,
      );
    });

    it('should apply the Gemini Live cached-input rate across cached modalities', () => {
      const cost = calculateGoogleCost(
        'gemini-live-2.5-flash-preview-native-audio-09-2025',
        {},
        1_000,
        500,
        false,
        400,
        500,
        undefined,
        0,
        500,
        300,
      );

      expect(cost).toBeCloseTo((400 * 0.3 + 500 * 0.075 + 100 * 3 + 500 * 12) / 1e6, 12);
    });

    it.each([
      'gemini-3.5-flash',
      'gemini-flash-latest',
    ])('should apply cached, audio, and priority pricing for %s', (modelId) => {
      const cost = calculateGoogleCost(
        modelId,
        { passthrough: { service_tier: 'priority' } },
        1_000,
        500,
        false,
        400,
        0,
        undefined,
        0,
        500,
        300,
      );

      expect(cost).toBeCloseTo(
        (1.8 * (400 * 1.5 + 200 * 0.15 + 100 * 1 + 300 * 0.15 + 500 * 9)) / 1e6,
        12,
      );
    });

    it.each([
      ['gemini-3.6-flash', 'priority', 1.5, 7.5, 1.8, 0.27],
      ['gemini-3.6-flash', 'flex', 1.5, 7.5, 0.5, 0.075],
      ['gemini-3.5-flash-lite', 'priority', 0.3, 2.5, 1.8, 0.05],
      ['gemini-3.5-flash-lite', 'flex', 0.3, 2.5, 0.5, 0.02],
    ])('should apply AI Studio cached multimodal pricing for %s at %s tier', (modelId, serviceTier, input, output, multiplier, cachedInput) => {
      const cost = calculateGoogleCost(
        modelId,
        { passthrough: { service_tier: serviceTier } },
        1_000,
        500,
        false,
        400,
        0,
        undefined,
        0,
        500,
        300,
      );

      expect(cost).toBeCloseTo(
        (multiplier * (500 * input + 500 * output) + 500 * cachedInput) / 1e6,
        12,
      );
    });

    it.each([
      ['priority', 1.8, 0.054],
      ['flex', 0.5, 0.015],
    ])('should keep Vertex Flash-Lite cached pricing at the %s tier', (serviceTier, multiplier, cachedInput) => {
      const cost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        { region: 'global', service_tier: serviceTier } as any,
        1_000,
        500,
        true,
        400,
        0,
        undefined,
        0,
        500,
        300,
      );

      expect(cost).toBeCloseTo(
        (multiplier * (500 * 0.3 + 500 * 2.5) + 500 * cachedInput) / 1e6,
        12,
      );
    });

    it.each([
      ['global', 0.00155],
      ['us', 0.001705],
      ['eu', 0.001705],
      ['us-central1', 0.00155],
      ['europe-west1', 0.00155],
    ])('applies the Gemini 3.5 Flash-Lite premium only to supported multi-regions: %s', (region, expectedCost) => {
      const cost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        { region } as any,
        1_000,
        500,
        true,
      );

      expect(cost).toBeCloseTo(expectedCost, 12);
    });

    it('should not stack the Gemini Vertex regional premium on a cost override', () => {
      const regionalCost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        { region: 'us', cost: 1 / 1e6 } as any,
        1_000,
        500,
        true,
      );

      expect(regionalCost).toBeCloseTo(0.0015, 12);
    });

    it('should apply the Vertex regional premium only to non-overridden input and output rates', () => {
      const inputOverrideCost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        { region: 'us', inputCost: 2 / 1e6 } as any,
        1_000,
        500,
        true,
      );
      const outputOverrideCost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        { region: 'us', outputCost: 4 / 1e6 } as any,
        1_000,
        500,
        true,
      );

      expect(inputOverrideCost).toBeCloseTo(0.003375, 12);
      expect(outputOverrideCost).toBeCloseTo(0.00233, 12);
    });

    it('should not apply the Vertex regional premium to overridden modality rates', () => {
      const regionalCost = calculateGoogleCost(
        'gemini-3.5-flash-lite',
        {
          region: 'us',
          audioInputCost: 2 / 1e6,
          audioOutputCost: 3 / 1e6,
          imageInputCost: 4 / 1e6,
          videoOutputCost: 5 / 1e6,
        } as any,
        1_000,
        500,
        true,
        200,
        100,
        150,
        300,
      );

      expect(regionalCost).toBeCloseTo(0.0035025, 12);
    });

    it.each([
      'gemini-3.1-pro-preview',
      'gemini-pro-latest',
    ])('should apply long-context cached and priority pricing for %s', (modelId) => {
      const cost = calculateGoogleCost(
        modelId,
        { service_tier: 'priority' } as any,
        250_001,
        1_000,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        1_000,
      );

      expect(cost).toBeCloseTo((1.8 * (249_001 * 4 + 1_000 * 0.4 + 1_000 * 18)) / 1e6, 12);
    });

    it('should apply standard and long-context priority pricing for Gemini 3.1 Pro custom tools', () => {
      const standardCost = calculateGoogleCost(
        'gemini-3.1-pro-preview-customtools',
        { passthrough: { serviceTier: 'priority' } },
        1_000,
        100,
      );
      const longContextCost = calculateGoogleCost(
        'gemini-3.1-pro-preview-customtools',
        { passthrough: { service_tier: 'priority' } },
        250_001,
        1_000,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        1_000,
      );

      expect(standardCost).toBeCloseTo((1.8 * (1_000 * 2 + 100 * 12)) / 1e6, 12);
      expect(longContextCost).toBeCloseTo(
        (1.8 * (249_001 * 4 + 1_000 * 0.4 + 1_000 * 18)) / 1e6,
        12,
      );
    });

    it.each([
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
    ])('should preserve the %s audio-input rate at priority tier', (modelId) => {
      const cost = calculateGoogleCost(
        modelId,
        { service_tier: 'priority' },
        1_000,
        100,
        false,
        200,
        0,
        undefined,
        0,
        500,
        100,
      );

      expect(cost).toBeCloseTo(
        (400 * 0.45 + 400 * 0.045 + 100 * 0.5 + 100 * 0.09 + 100 * 2.7) / 1e6,
        12,
      );
    });

    it.each([
      'gemini-3.1-flash-lite',
      'gemini-flash-lite-latest',
    ])('should apply %s flex pricing with passthrough precedence', (modelId) => {
      const flexCost = calculateGoogleCost(
        modelId,
        { service_tier: 'priority', passthrough: { service_tier: 'flex' } },
        1_000_000,
        100_000,
        false,
        200_000,
        0,
        undefined,
        0,
        500_000,
        100_000,
      );

      expect(flexCost).toBeCloseTo(
        (400_000 * 0.125 + 400_000 * 0.0125 + 100_000 * 0.5 + 100_000 * 0.025 + 100_000 * 0.75) /
          1e6,
        12,
      );
    });

    it.each([
      ['gemini-flash-latest', 1.5, 0.15, 0.15, 1, 9],
      ['gemini-flash-lite-latest', 0.25, 0.025, 0.05, 0.5, 1.5],
      ['gemini-2.0-flash-001', 0.1, 0.025, 0.175, 0.7, 0.4],
    ])('uses AI Studio cached and audio rates for %s', (id, input, cached, cachedAudio, audioInput, output) => {
      expect(
        calculateGoogleCost(id, {}, 1_000, 100, false, 200, 0, undefined, 0, 400, 100),
      ).toBeCloseTo(
        (500 * input + 300 * cached + 100 * audioInput + 100 * cachedAudio + 100 * output) / 1e6,
        12,
      );
    });

    it.each([
      ['gemini-2.5-flash', 0.1],
      ['gemini-2.5-flash-lite', 0.03],
      ['gemini-3-flash-preview', 0.1],
      ['gemini-3.1-flash-lite', 0.05],
      ['gemini-2.0-flash-001', 0.175],
    ])('uses the published cached-audio rate for %s', (id, cachedAudio) => {
      expect(
        calculateGoogleCost(
          id,
          {},
          1_000_000,
          0,
          false,
          1_000_000,
          0,
          undefined,
          0,
          1_000_000,
          1_000_000,
        ),
      ).toBeCloseTo(cachedAudio, 12);
    });

    it.each([
      ['gemini-2.5-pro-preview-tts', 1, 20],
      ['gemini-2.5-flash-preview-tts', 0.5, 10],
    ])('prices %s using the published TTS rates without context tiering', (id, input, output) => {
      expect(calculateGoogleCost(id, {}, 1_000, 100, false, 0, 100)).toBeCloseTo(
        (1_000 * input + 100 * output) / 1e6,
        12,
      );
      expect(calculateGoogleCost(id, {}, 250_001, 1_000, false, 0, 1_000)).toBeCloseTo(
        (250_001 * input + 1_000 * output) / 1e6,
        12,
      );
    });

    it('should forward standard Gemini usage metadata into modality-aware billing', () => {
      const cost = calculateGoogleCostFromUsage(
        'gemini-3.5-flash',
        { passthrough: { service_tier: 'priority' } },
        1_000,
        500,
        false,
        {
          promptTokensDetails: [
            { modality: 'TEXT', tokenCount: 600 },
            { modality: 'AUDIO', tokenCount: 400 },
          ],
          cacheTokensDetails: [
            { modality: 'TEXT', tokenCount: 200 },
            { modality: 'AUDIO', tokenCount: 300 },
          ],
          cachedContentTokenCount: 500,
          candidatesTokensDetails: [{ modality: 'TEXT', tokenCount: 500 }],
        },
      );

      expect(cost).toBeCloseTo(
        (1.8 * (400 * 1.5 + 200 * 0.15 + 100 * 1 + 300 * 0.15 + 500 * 9)) / 1e6,
        12,
      );
    });

    it('uses the actual response tier instead of the requested priority tier', () => {
      const cost = calculateGoogleCostFromUsage(
        'gemini-3.5-flash-lite',
        { service_tier: 'priority' },
        1_000,
        100,
        true,
        { serviceTier: 'SERVICE_TIER_STANDARD' },
      );

      expect(cost).toBeCloseTo(0.00055, 12);
    });

    it('prefers the actual response header tier over usage metadata', () => {
      const cost = calculateGoogleCostFromUsage(
        'gemini-3.5-flash-lite',
        { service_tier: 'priority' },
        1_000,
        100,
        true,
        { serviceTier: 'SERVICE_TIER_PRIORITY' },
        'standard',
      );

      expect(cost).toBeCloseTo(0.00055, 12);
    });

    it('should infer cached Gemini audio and image tokens without cache modality details', () => {
      const model = 'gemini-live-2.5-flash-preview-native-audio-09-2025';
      const calculateCachedCost = (modality: 'AUDIO' | 'IMAGE') =>
        calculateGoogleCostFromUsage(model, {}, 1_000, 0, false, {
          promptTokensDetails: [{ modality, tokenCount: 1_000 }],
          cachedContentTokenCount: 1_000,
        });

      expect(calculateCachedCost('AUDIO')).toBeCloseTo((1_000 * 0.075) / 1e6, 12);
      expect(calculateCachedCost('IMAGE')).toBeCloseTo((1_000 * 0.075) / 1e6, 12);

      const calculateMixedCachedCost = (modality: 'AUDIO' | 'IMAGE') =>
        calculateGoogleCostFromUsage(model, {}, 1_000, 0, false, {
          promptTokensDetails: [
            { modality: 'TEXT', tokenCount: 200 },
            { modality, tokenCount: 800 },
          ],
          cachedContentTokenCount: 500,
        });
      expect(calculateMixedCachedCost('AUDIO')).toBeCloseTo(
        (200 * 0.075 + 500 * 3 + 300 * 0.075) / 1e6,
        12,
      );
      expect(calculateMixedCachedCost('IMAGE')).toBeCloseTo(
        (200 * 0.075 + 500 * 0.3 + 300 * 0.075) / 1e6,
        12,
      );
    });

    it('should use the image-input rate for gemini-3.1-flash-live-preview', () => {
      const cost = calculateGoogleCost(
        'gemini-3.1-flash-live-preview',
        {},
        1_000,
        0,
        false,
        0,
        0,
        undefined,
        1_000,
      );
      expect(cost).toBeCloseTo(1_000 / 1e6, 12);
    });

    it('should not apply long-context tiered pricing to gemini-3.5-flash', () => {
      // gemini-3.5-flash is flat-rate: prompts above 200k tokens bill at the
      // standard rate (unlike the tiered gemini-3.1-pro-preview).
      const cost = calculateGoogleCost('gemini-3.5-flash', {}, 250000, 50000);
      // Expected: (250000 * 1.5 + 50000 * 9.0) / 1M = (375000 + 450000) / 1M = 0.825
      expect(cost).toBeCloseTo(0.825, 10);
    });

    it('should calculate cost for gemini-embedding-2', () => {
      // gemini-embedding-2: input=0.2/1M, output=0
      const cost = calculateGoogleCost('gemini-embedding-2', {}, 10000, 0);
      // Expected: (10000 * 0.2) / 1M = 0.002
      expect(cost).toBeCloseTo(0.002, 10);
    });

    it('should calculate cost for gemini-embedding-2-preview (tracks gemini-embedding-2)', () => {
      // gemini-embedding-2-preview: input=0.2/1M, output=0
      const cost = calculateGoogleCost('gemini-embedding-2-preview', {}, 10000, 0);
      expect(cost).toBeCloseTo(0.002, 10);
    });

    it('should apply resolved-model tiered pricing for the gemini-pro-latest alias', () => {
      const costBelowThreshold = calculateGoogleCost('gemini-pro-latest', {}, 100000, 50000);
      expect(costBelowThreshold).toBeCloseTo(0.8, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-pro-latest', {}, 250000, 50000);
      expect(costAboveThreshold).toBeCloseTo(1.9, 10);
    });

    it('should apply tiered pricing for gemini-2.5-pro when above threshold', () => {
      // gemini-2.5-pro: base input=1.25/1M, output=10.0/1M
      // tiered (>200k): input=2.5/1M, output=15.0/1M
      const costBelowThreshold = calculateGoogleCost('gemini-2.5-pro', {}, 100000, 50000);
      // Expected (below 200k): (100000 * 1.25 + 50000 * 10.0) / 1M = 0.625
      expect(costBelowThreshold).toBeCloseTo(0.625, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-2.5-pro', {}, 250000, 50000);
      // Expected (above 200k): (250000 * 2.5 + 50000 * 15.0) / 1M = 1.375
      expect(costAboveThreshold).toBeCloseTo(1.375, 10);
    });

    it('should apply tiered pricing for gemini-1.5-pro when above threshold', () => {
      // gemini-1.5-pro: base input=1.25/1M, output=5.0/1M
      // tiered (>128k): input=2.5/1M, output=10.0/1M
      const costBelowThreshold = calculateGoogleCost('gemini-1.5-pro', {}, 100000, 50000);
      // Expected (below 128k): (100000 * 1.25 + 50000 * 5.0) / 1M = 0.375
      expect(costBelowThreshold).toBeCloseTo(0.375, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-1.5-pro', {}, 150000, 50000);
      // Expected (above 128k): (150000 * 2.5 + 50000 * 10.0) / 1M = 0.875
      expect(costAboveThreshold).toBeCloseTo(0.875, 10);
    });

    it('should apply tiered pricing for gemini-1.5-flash when above threshold', () => {
      // gemini-1.5-flash: base input=0.075/1M, output=0.3/1M
      // tiered (>128k): input=0.15/1M, output=0.6/1M
      const costBelowThreshold = calculateGoogleCost('gemini-1.5-flash', {}, 100000, 50000);
      // Expected (below 128k): (100000 * 0.075 + 50000 * 0.3) / 1M = 0.0225
      expect(costBelowThreshold).toBeCloseTo(0.0225, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-1.5-flash', {}, 150000, 50000);
      // Expected (above 128k): (150000 * 0.15 + 50000 * 0.6) / 1M = 0.0525
      expect(costAboveThreshold).toBeCloseTo(0.0525, 10);
    });

    it('should apply tiered pricing for gemini-1.5-flash-8b when above threshold', () => {
      // gemini-1.5-flash-8b: base input=0.0375/1M, output=0.15/1M
      // tiered (>128k): input=0.075/1M, output=0.3/1M
      const costBelowThreshold = calculateGoogleCost('gemini-1.5-flash-8b', {}, 100000, 50000);
      // Expected (below 128k): (100000 * 0.0375 + 50000 * 0.15) / 1M = 0.01125
      expect(costBelowThreshold).toBeCloseTo(0.01125, 10);

      const costAboveThreshold = calculateGoogleCost('gemini-1.5-flash-8b', {}, 150000, 50000);
      // Expected (above 128k): (150000 * 0.075 + 50000 * 0.3) / 1M = 0.02625
      expect(costAboveThreshold).toBeCloseTo(0.02625, 10);
    });

    it('should calculate cost for gemini-embedding-001', () => {
      // gemini-embedding-001: input=0.15/1M, output=0
      const cost = calculateGoogleCost('gemini-embedding-001', {}, 10000, 0);
      // Expected: (10000 * 0.15 + 0 * 0) / 1M = 0.0015
      expect(cost).toBeCloseTo(0.0015, 10);
    });

    it('should calculate cost for gemini-robotics-er-1.6-preview', () => {
      // gemini-robotics-er-1.6-preview: input=1.0/1M, output=5.0/1M
      const cost = calculateGoogleCost('gemini-robotics-er-1.6-preview', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.0035, 10);
    });

    it('should calculate resolved-model cost for gemini-flash-latest', () => {
      const cost = calculateGoogleCost('gemini-flash-latest', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.006, 10);
    });

    it('should calculate resolved-model cost for gemini-flash-lite-latest', () => {
      const cost = calculateGoogleCost('gemini-flash-lite-latest', {}, 1000, 500);
      expect(cost).toBeCloseTo(0.001, 10);
    });

    it('should return undefined for shutdown models', () => {
      // Deprecated/shutdown Google model IDs: these should not appear in GOOGLE_MODELS
      // and should return undefined pricing if referenced directly.
      // Keep this list aligned with Google's model lifecycle/deprecation documentation.
      const shutdownModels = [
        'gemini-2.5-pro-preview-05-06',
        'gemini-2.5-pro-preview-06-05',
        'gemini-2.5-flash-preview-05-20',
        'gemini-2.5-flash-preview-09-2025',
        'gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.5-flash-lite-preview-06-17',
        'gemini-2.0-pro',
        'gemini-2.0-flash-exp',
        'gemini-2.0-flash-thinking-exp',
        'gemini-2.0-flash-lite-preview-02-05',
        'gemini-robotics-er-1.5-preview',
      ];
      const catalogModelIds = GOOGLE_MODELS.map((model) => model.id);

      for (const model of shutdownModels) {
        expect(catalogModelIds).not.toContain(model);
        expect(calculateGoogleCost(model, {}, 1000, 500)).toBeUndefined();
      }
    });

    it('should return undefined for models without pricing data', () => {
      // Legacy PaLM models don't have pricing
      expect(calculateGoogleCost('chat-bison', {}, 100, 50)).toBeUndefined();
      expect(calculateGoogleCost('gemma', {}, 100, 50)).toBeUndefined();
    });

    it('should respect custom cost override in config', () => {
      // When config.cost is set, it should override default pricing
      const config = { cost: 0.001 }; // $1 per 1000 tokens
      const cost = calculateGoogleCost('gemini-pro', config, 1000, 500);
      // Expected: (1000 + 500) * 0.001 = 1.5
      expect(cost).toBeCloseTo(1.5, 10);
    });

    it('should respect separate custom input and output cost overrides in config', () => {
      const config = { inputCost: 0.001, outputCost: 0.003 };
      const cost = calculateGoogleCost('gemini-pro', config, 1000, 500);
      expect(cost).toBeCloseTo(2.5, 10);
    });

    it('should prefer separate custom costs over custom cost', () => {
      const config = { cost: 0.02, inputCost: 0.001, outputCost: 0.003 };
      const cost = calculateGoogleCost('gemini-pro', config, 1000, 500);
      expect(cost).toBeCloseTo(2.5, 10);
    });

    it('should apply generic and modality-specific cost overrides to multimodal tokens', () => {
      expect(
        calculateGoogleCost(
          'gemini-2.5-flash',
          { cost: 0.01 },
          200,
          300,
          false,
          100,
          100,
          100,
          100,
        ),
      ).toBeCloseTo(5, 10);
      expect(
        calculateGoogleCost(
          'gemini-2.5-flash',
          { inputCost: 0.02, outputCost: 0.03 },
          200,
          300,
          false,
          100,
          100,
          100,
          100,
        ),
      ).toBeCloseTo(13, 10);
      expect(
        calculateGoogleCost(
          'gemini-2.5-flash',
          {
            inputCost: 0.02,
            outputCost: 0.03,
            audioInputCost: 0.04,
            audioOutputCost: 0.05,
            imageInputCost: 0.06,
            videoOutputCost: 0.07,
          },
          200,
          300,
          false,
          100,
          100,
          100,
          100,
        ),
      ).toBeCloseTo(25, 10);
      expect(
        calculateGoogleCost(
          'gemini-2.5-flash',
          { inputCost: 0.02 },
          200,
          0,
          false,
          100,
          0,
          0,
          100,
          200,
          100,
          100,
        ),
      ).toBeCloseTo(4, 10);
    });

    it('should respect separate custom costs for tiered pricing', () => {
      const config = { inputCost: 0.001, outputCost: 0.003 };
      const cost = calculateGoogleCost('gemini-2.5-pro', config, 250000, 50000);
      expect(cost).toBeCloseTo(400, 10);
    });

    it('should use Vertex-specific pricing for gemini-2.0-flash in Vertex mode', () => {
      // AI Studio: input=0.1/1M, output=0.4/1M
      // Vertex AI: input=0.15/1M, output=0.6/1M
      const aiStudioCost = calculateGoogleCost('gemini-2.0-flash', {}, 10000, 5000);
      const vertexCost = calculateGoogleCost('gemini-2.0-flash', {}, 10000, 5000, true);
      // AI Studio: (10000 * 0.1 + 5000 * 0.4) / 1M = 0.003
      expect(aiStudioCost).toBeCloseTo(0.003, 10);
      // Vertex: (10000 * 0.15 + 5000 * 0.6) / 1M = 0.0045
      expect(vertexCost).toBeCloseTo(0.0045, 10);
    });

    it('should respect separate custom costs for Vertex-specific pricing', () => {
      const config = { inputCost: 0.001, outputCost: 0.003 };
      const cost = calculateGoogleCost('gemini-2.0-flash', config, 10000, 5000, true);
      expect(cost).toBeCloseTo(25, 10);
    });

    it('should use standard pricing for models without Vertex-specific pricing in Vertex mode', () => {
      // gemini-2.5-flash has no vertexCost, so Vertex mode uses the same price
      const aiStudioCost = calculateGoogleCost('gemini-2.5-flash', {}, 1000, 500);
      const vertexCost = calculateGoogleCost('gemini-2.5-flash', {}, 1000, 500, true);
      expect(vertexCost).toBeCloseTo(aiStudioCost!, 10);
    });
  });

  describe('normalizeSafetySettings', () => {
    it('should return undefined when given undefined', () => {
      expect(normalizeSafetySettings(undefined)).toBeUndefined();
    });

    it('should pass through threshold field as-is', () => {
      const result = normalizeSafetySettings([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      ]);
      expect(result).toEqual([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      ]);
    });

    it('should map legacy probability field to threshold', () => {
      const result = normalizeSafetySettings([
        { category: 'HARM_CATEGORY_HARASSMENT', probability: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]);
      expect(result).toEqual([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]);
    });

    it('should prefer threshold over probability when both are set', () => {
      const result = normalizeSafetySettings([
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH',
          probability: 'BLOCK_MEDIUM_AND_ABOVE',
        },
      ]);
      expect(result).toEqual([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      ]);
    });

    it('should handle multiple safety settings', () => {
      const result = normalizeSafetySettings([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]);
      expect(result).toEqual([
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ]);
    });
  });

  describe('resolveGoogleToolConfig', () => {
    it('any disable signal forces NONE, even when explicit toolConfig says AUTO', () => {
      // Documents the safety bias: a "no tools" signal from any source wins.
      // If this needs to flip, update the test with the new precedence rule.
      const result = resolveGoogleToolConfig({
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        tool_choice: 'none',
      });
      expect(result).toEqual({
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        toolsDisabled: true,
      });
    });

    it('preserves AUTO when no disable signal is present', () => {
      const result = resolveGoogleToolConfig({
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      });
      expect(result).toEqual({
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        toolsDisabled: false,
      });
    });

    it('falls back to tool_choice when explicit toolConfig has invalid mode', () => {
      const result = resolveGoogleToolConfig({
        toolConfig: { functionCallingConfig: { mode: 'BOGUS' as any } },
        tool_choice: 'required',
      });
      expect(result).toEqual({
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        toolsDisabled: false,
      });
    });

    it('merges a required tool choice with streamed function-call arguments', () => {
      const result = resolveGoogleToolConfig({
        tool_choice: 'required',
        toolConfig: {
          functionCallingConfig: { streamFunctionCallArguments: true },
        },
      });

      expect(result).toEqual({
        toolConfig: {
          functionCallingConfig: { mode: 'ANY', streamFunctionCallArguments: true },
        },
        toolsDisabled: false,
      });
    });

    it('merges a named tool choice with snake_case streamed function-call arguments', () => {
      const result = resolveGoogleToolConfig({
        tool_choice: { type: 'function', function: { name: 'get_weather' } },
        tool_config: {
          function_calling_config: { stream_function_call_arguments: true },
        },
      });

      expect(result).toEqual({
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['get_weather'],
            streamFunctionCallArguments: true,
          },
        },
        toolsDisabled: false,
      });
    });

    it('preserves Maps retrieval config without a function-calling policy', () => {
      const result = resolveGoogleToolConfig({
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 42.36, longitude: -71.06 },
            languageCode: 'en-US',
          },
          includeServerSideToolInvocations: true,
        },
      });

      expect(result).toEqual({
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 42.36, longitude: -71.06 },
            languageCode: 'en-US',
          },
          includeServerSideToolInvocations: true,
        },
        toolsDisabled: false,
      });
    });

    it('normalizes snake_case Maps retrieval config and preserves it when functions are disabled', () => {
      const result = resolveGoogleToolConfig({
        tool_config: {
          retrieval_config: {
            lat_lng: { latitude: 42.36, longitude: -71.06 },
            language_code: 'en-US',
          },
          include_server_side_tool_invocations: true,
        },
        tool_choice: 'none',
      });

      expect(result).toEqual({
        toolConfig: {
          functionCallingConfig: { mode: 'NONE' },
          retrievalConfig: {
            latLng: { latitude: 42.36, longitude: -71.06 },
            languageCode: 'en-US',
          },
          includeServerSideToolInvocations: true,
        },
        toolsDisabled: true,
      });
    });
  });

  describe('removeGoogleFunctionDeclarations', () => {
    it('drops tools that only contain functionDeclarations', () => {
      const tools = [{ functionDeclarations: [{ name: 'foo' }] }, { googleSearch: {} }] as Tool[];
      expect(removeGoogleFunctionDeclarations(tools)).toEqual([{ googleSearch: {} }]);
    });

    it('drops empty functionDeclarations entries', () => {
      const tools = [{ functionDeclarations: [] }] as Tool[];
      expect(removeGoogleFunctionDeclarations(tools)).toEqual([]);
    });

    it('drops documented snake_case function_declarations entries', () => {
      const tools = [{ function_declarations: [{ name: 'foo' }] }] as unknown as Tool[];
      expect(removeGoogleFunctionDeclarations(tools)).toEqual([]);
    });

    it('strips functionDeclarations from mixed-capability tool entries', () => {
      const tools = [
        {
          functionDeclarations: [{ name: 'foo' }],
          googleSearch: {},
        },
      ] as Tool[];
      expect(removeGoogleFunctionDeclarations(tools)).toEqual([{ googleSearch: {} }]);
    });

    it('strips snake_case function declarations from a single mixed-capability tool', () => {
      const tool = {
        function_declarations: [{ name: 'foo' }],
        googleSearch: {},
      } as unknown as Tool;
      expect(removeGoogleFunctionDeclarations(tool)).toEqual([{ googleSearch: {} }]);
    });

    it('passes through non-function tools unchanged', () => {
      const tools = [{ googleSearch: {} }, { codeExecution: {} }] as Tool[];
      expect(removeGoogleFunctionDeclarations(tools)).toEqual([
        { googleSearch: {} },
        { codeExecution: {} },
      ]);
    });
  });

  describe('stripExecutableToolFileReferences', () => {
    it('removes executable refs while preserving inline and data-file tools', () => {
      expect(
        stripExecutableToolFileReferences([
          { googleSearch: {} },
          'file://tools.js:getTools',
          'file://tools.py:get_tools',
          'file://tools.json',
          'file://tools.yaml',
          { codeExecution: {} },
        ]),
      ).toEqual([
        { googleSearch: {} },
        'file://tools.json',
        'file://tools.yaml',
        { codeExecution: {} },
      ]);
    });
  });

  describe('mergeParts', () => {
    it('detaches the initial multipart chunk and reuses the accumulator thereafter', () => {
      const firstChunk = [{ functionCall: { name: 'look_up', args: { query: 'weather' } } }];
      const secondChunk = [{ text: 'done' }];

      const accumulator = mergeParts(undefined, firstChunk);
      if (!Array.isArray(accumulator)) {
        throw new Error('Expected multipart output');
      }

      expect(accumulator).not.toBe(firstChunk);
      expect(mergeParts(accumulator, secondChunk)).toBe(accumulator);
      expect(accumulator).toEqual([...firstChunk, ...secondChunk]);
      expect(firstChunk).toEqual([
        { functionCall: { name: 'look_up', args: { query: 'weather' } } },
      ]);
    });
  });

  describe('mergeGoogleCompletionOptions', () => {
    it('treats prompt-level undefined as "not set" and preserves base policy', () => {
      const merged = mergeGoogleCompletionOptions(
        {
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        },
        { tool_choice: undefined } as any,
      );
      expect(merged.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
      expect(merged.tool_choice).toBeUndefined();
    });

    it('replaces all three policy fields when prompt sets any one explicitly', () => {
      const merged = mergeGoogleCompletionOptions(
        {
          toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
          tool_config: { function_calling_config: { mode: 'AUTO' } },
        },
        { tool_choice: 'none' },
      );
      expect(merged.tool_choice).toBe('none');
      expect(merged.toolConfig).toBeUndefined();
      expect(merged.tool_config).toBeUndefined();
    });
  });

  describe('collectGroundingMetadata', () => {
    it('returns empty object when no candidates carry grounding signals', () => {
      const result = collectGroundingMetadata([
        { candidates: [{ content: { parts: [{ text: 'plain' }] } }] } as any,
      ]);
      expect(result).toEqual({});
    });

    it('returns the single candidate metadata as-is', () => {
      const groundingMetadata = {
        webSearchQueries: ['q'],
        groundingChunks: [{ web: { uri: 'https://x' } }],
      };
      const result = collectGroundingMetadata([
        {
          candidates: [{ content: { parts: [{ text: 't' }] }, groundingMetadata }],
        } as any,
      ]);
      expect(result.groundingMetadata).toEqual(groundingMetadata);
    });

    it('concatenates array fields across nested groundingMetadata chunks and keeps the last refinement', () => {
      const result = collectGroundingMetadata([
        {
          candidates: [
            {
              content: { parts: [{ text: 'a' }] },
              groundingMetadata: {
                webSearchQueries: ['q1'],
                groundingChunks: [{ web: { uri: 'https://1' } }],
                searchEntryPoint: { renderedContent: 'old' },
              },
            },
          ],
        } as any,
        {
          candidates: [
            {
              content: { parts: [{ text: 'b' }] },
              groundingMetadata: {
                webSearchQueries: ['q2'],
                groundingChunks: [{ web: { uri: 'https://2' } }],
                groundingSupports: [{ segment: { startIndex: 0, endIndex: 1 } }],
                searchEntryPoint: { renderedContent: 'new' },
                retrievalMetadata: { dynamicRetrievalScore: 0.9 },
              },
            },
          ],
        } as any,
      ]);
      const merged = result.groundingMetadata as Record<string, any>;
      expect(merged.webSearchQueries).toEqual(['q1', 'q2']);
      expect(merged.groundingChunks).toEqual([
        { web: { uri: 'https://1' } },
        { web: { uri: 'https://2' } },
      ]);
      expect(merged.groundingSupports).toEqual([{ segment: { startIndex: 0, endIndex: 1 } }]);
      expect(merged.searchEntryPoint).toEqual({ renderedContent: 'new' });
      expect(merged.retrievalMetadata).toEqual({ dynamicRetrievalScore: 0.9 });
    });

    it('concatenates flat grounding fields when candidates carry them directly', () => {
      const result = collectGroundingMetadata([
        {
          candidates: [
            {
              content: { parts: [{ text: 'a' }] },
              webSearchQueries: ['x'],
              groundingChunks: [{ web: { uri: 'https://x' } }],
            },
          ],
        } as any,
        {
          candidates: [
            {
              content: { parts: [{ text: 'b' }] },
              webSearchQueries: ['y'],
              groundingSupports: [{ segment: { startIndex: 0, endIndex: 1 } }],
            },
          ],
        } as any,
      ]);
      expect(result.webSearchQueries).toEqual(['x', 'y']);
      expect(result.groundingChunks).toEqual([{ web: { uri: 'https://x' } }]);
      expect(result.groundingSupports).toEqual([{ segment: { startIndex: 0, endIndex: 1 } }]);
      expect(result.groundingMetadata).toBeUndefined();
    });
  });
});
