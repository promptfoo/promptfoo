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
import {
  calculateGeminiCost,
  clearCachedAuth,
  geminiFormatAndSystemInstructions,
  loadFile,
  maybeCoerceToGeminiFormat,
  normalizeTools,
  parseStringObject,
  resolveProjectId,
  sanitizeSchemaForGemini,
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
    // Clear all mocks
    vi.clearAllMocks();

    // Reset the Google Auth mock to default state
    const { mockAuthInstance } = googleAuthMock;
    mockAuthInstance.getClient.mockResolvedValue({ name: 'mockClient' });
    mockAuthInstance.fromJSON.mockImplementation((credentials: any) => {
      return Promise.resolve({ name: 'mockCredentialClient', credentials });
    });
    mockAuthInstance.getProjectId.mockResolvedValue('google-auth-project');
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

    // NOTE: This test is skipped due to unreliable mock isolation of Google Auth Library.
    // The hoisted mock doesn't consistently prevent real gcloud credentials from being loaded,
    // especially on systems with gcloud configured. The clearCachedAuth() helper works for
    // most tests, but this specific test requires mocking the GoogleAuth instance itself,
    // which has proven unreliable with Vitest's current mocking system.
    // See: https://github.com/promptfoo/promptfoo/pull/6924
    it.skip('should fall back to Google Auth Library when no config or env vars', async () => {
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
});

describe('calculateGeminiCost', () => {
  it('should calculate cost using model pricing', () => {
    // gemini-2.5-pro: $1.25/M input, $10/M output
    const cost = calculateGeminiCost('gemini-2.5-pro', {}, 100000, 10000);
    expect(cost).toBeCloseTo(0.225, 5);
  });

  it('should use tiered pricing for prompts > 200k tokens', () => {
    // gemini-2.5-pro with >200k tokens: $2.50/M input, $15/M output
    const cost = calculateGeminiCost('gemini-2.5-pro', {}, 250000, 1000);
    expect(cost).toBeCloseTo(0.64, 5);
  });

  it('should return undefined for unknown models or missing tokens', () => {
    expect(calculateGeminiCost('unknown-model', {}, 1000, 500)).toBeUndefined();
    expect(calculateGeminiCost('gemini-2.5-pro', {}, undefined, 500)).toBeUndefined();
  });

  it('should allow config cost override', () => {
    const cost = calculateGeminiCost('gemini-2.5-pro', { cost: 0.001 }, 1000, 500);
    expect(cost).toBeCloseTo(1.5, 5);
  });
});
