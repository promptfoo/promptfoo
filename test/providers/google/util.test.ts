import * as fs from 'fs';
import { GoogleAuth } from 'google-auth-library';
import * as nunjucks from 'nunjucks';
import logger from '../../../src/logger';
import type { Tool } from '../../../src/providers/google/types';
import {
  maybeCoerceToGeminiFormat,
  geminiFormatAndSystemInstructions,
  getGoogleClient,
  hasGoogleDefaultCredentials,
  loadFile,
  parseStringObject,
  validateFunctionCall,
  normalizeTools,
} from '../../../src/providers/google/util';

jest.mock('google-auth-library');

jest.mock('glob', () => ({
  globSync: jest.fn().mockReturnValue([]),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockImplementation((path) => {
    if (path === 'file://system_instruction.json') {
      return true;
    }
    return false;
  }),
  readFileSync: jest.fn().mockImplementation((path) => {
    if (path === 'file://system_instruction.json') {
      return 'system instruction';
    }
    throw new Error(`Mock file not found: ${path}`);
  }),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

describe('util', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (global as any).cachedAuth = undefined;
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

    it('should handle unknown format', () => {
      const input = { unknown: 'format' };
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: input,
        coerced: false,
        systemInstruction: undefined,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        `Unknown format for Gemini: ${JSON.stringify(input)}`,
      );
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

    it('should log a warning and return the input for unknown formats', () => {
      const loggerSpy = jest.spyOn(logger, 'warn');
      const input = { unknownFormat: 'test' };
      const result = maybeCoerceToGeminiFormat(input);
      expect(result).toEqual({
        contents: input,
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
    it('should create and return Google client', async () => {
      const mockClient = { name: 'mockClient' };
      const mockProjectId = 'test-project';
      const mockAuth = {
        getClient: jest.fn().mockResolvedValue(mockClient),
        getProjectId: jest.fn().mockResolvedValue(mockProjectId),
      };

      jest.mocked(GoogleAuth).mockImplementation(() => mockAuth as any);

      const result = await getGoogleClient();
      expect(result).toEqual({
        client: mockClient,
        projectId: mockProjectId,
      });
    });

    it('should reuse cached auth client', async () => {
      const mockClient = { name: 'mockClient' };
      const mockProjectId = 'test-project';
      const mockAuth = {
        getClient: jest.fn().mockResolvedValue(mockClient),
        getProjectId: jest.fn().mockResolvedValue(mockProjectId),
      };

      jest.mocked(GoogleAuth).mockImplementation(() => mockAuth as any);

      await getGoogleClient();
      const googleAuthCalls = jest.mocked(GoogleAuth).mock.calls.length;

      await getGoogleClient();
      expect(jest.mocked(GoogleAuth).mock.calls).toHaveLength(googleAuthCalls);
    });
  });

  describe('hasGoogleDefaultCredentials', () => {
    it('should return true when credentials are available', async () => {
      const mockAuth = {
        getClient: jest.fn().mockResolvedValue({}),
        getProjectId: jest.fn().mockResolvedValue('test-project'),
      };

      jest.mocked(GoogleAuth).mockImplementation(() => mockAuth as any);

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

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(tools);
      const result = loadFile(config_var, context_vars);
      expect(result).toEqual(JSON.parse(tools));
      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('fp.json'));
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
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(system_instruction);

      const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
        JSON.stringify(prompt),
        { system_instruction: 'file://system_instruction.json' },
        '{{system_instruction}}',
      );

      expect(contents).toEqual([{ parts: [{ text: 'user message' }], role: 'user' }]);
      expect(systemInstruction).toEqual({ parts: [{ text: 'system instruction' }] });
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
  });
});
