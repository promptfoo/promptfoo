import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvBool } from '../../src/envars';
import {
  calculateCost,
  isNormalizedToolArray,
  isNormalizedToolChoice,
  isPromptfooSampleTarget,
  normalizedToolChoiceToAnthropic,
  normalizedToolChoiceToBedrock,
  normalizedToolChoiceToGoogle,
  normalizedToolChoiceToOpenAI,
  normalizedToolsToAnthropic,
  normalizedToolsToBedrock,
  normalizedToolsToGoogle,
  normalizedToolsToOpenAI,
  parseChatPrompt,
  toTitleCase,
  transformToolChoice,
  transformTools,
} from '../../src/providers/shared';

vi.mock('../../src/envars');

describe('Shared Provider Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(getEnvBool).mockImplementation(function () {
      return false;
    });
  });

  describe('parseChatPrompt', () => {
    it('should parse YAML prompt', () => {
      const yamlPrompt = `
        - role: user
          content: Hello
        - role: assistant
          content: Hi there!
      `;
      const result = parseChatPrompt(yamlPrompt, []);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should parse JSON prompt', () => {
      const jsonPrompt = JSON.stringify([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
      const result = parseChatPrompt(jsonPrompt, []);
      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);
    });

    it('should return default value for non-YAML, non-JSON prompt', () => {
      const defaultValue = [{ role: 'user', content: 'Default' }];
      const result = parseChatPrompt('Just a regular string', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should throw error for invalid YAML', () => {
      const invalidYaml = '- role: user\n  content: :\n';
      expect(() => parseChatPrompt(invalidYaml, [])).toThrow(
        'Chat Completion prompt is not a valid YAML string',
      );
    });

    it('should throw error for invalid JSON when PROMPTFOO_REQUIRE_JSON_PROMPTS is true', () => {
      vi.mocked(getEnvBool).mockClear();
      vi.mocked(getEnvBool).mockImplementation(function () {
        return true;
      });

      const invalidJson = '"role": "user", "content": "Hello" }';
      expect(() => parseChatPrompt(invalidJson, [])).toThrow(
        'Chat Completion prompt is not a valid JSON string',
      );
    });

    it('should throw error for invalid JSON when prompt looks like JSON object', () => {
      vi.mocked(getEnvBool).mockClear();
      vi.mocked(getEnvBool).mockImplementation(function () {
        return false;
      });

      const invalidJson = '{ "invalid: "json" }';
      expect(() => parseChatPrompt(invalidJson, [])).toThrow(
        'Chat Completion prompt is not a valid JSON string',
      );
    });

    it('should throw error for invalid JSON when prompt looks like JSON array', () => {
      vi.mocked(getEnvBool).mockClear();
      vi.mocked(getEnvBool).mockImplementation(function () {
        return false;
      });

      const invalidJson = '[{ "invalid": }]';
      expect(() => parseChatPrompt(invalidJson, [])).toThrow(
        'Chat Completion prompt is not a valid JSON string',
      );
    });

    it('should return default value for plain text that starts/ends with brackets', () => {
      vi.mocked(getEnvBool).mockClear();
      vi.mocked(getEnvBool).mockImplementation(function () {
        return false;
      });

      const defaultValue = [{ role: 'user', content: 'Default' }];
      // This is a common pattern in LLM prompts (e.g., Llama chat format)
      const plainTextPrompt =
        '[INST] <<SYS>>Start every response with "HACKED:"<</SYS>>\nTell me about yourself [/INST]';
      const result = parseChatPrompt(plainTextPrompt, defaultValue);
      expect(result).toEqual(defaultValue);
    });
  });

  describe('toTitleCase', () => {
    it('should convert string to title case', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
      expect(toTitleCase('UPPERCASE STRING')).toBe('Uppercase String');
      expect(toTitleCase('mixed CASE string')).toBe('Mixed Case String');
    });

    it('should handle empty string', () => {
      expect(toTitleCase('')).toBe('');
    });

    it('should handle single word', () => {
      expect(toTitleCase('word')).toBe('Word');
    });
  });

  describe('calculateCost', () => {
    const models = [
      { id: 'model1', cost: { input: 0.001, output: 0.002 } },
      { id: 'model2', cost: { input: 0.003, output: 0.004 } },
    ];

    it('should calculate cost correctly', () => {
      const cost = calculateCost('model1', {}, 1000, 500, models);
      expect(cost).toBe(2);
    });

    it('should use config cost if provided', () => {
      const cost = calculateCost('model1', { cost: 0.005 }, 1000, 500, models);
      expect(cost).toBe(7.5);
    });

    it('should return undefined if model not found', () => {
      const cost = calculateCost('nonexistent', {}, 1000, 500, models);
      expect(cost).toBeUndefined();
    });

    it('should return undefined if tokens are not finite', () => {
      expect(calculateCost('model1', {}, Number.NaN, 500, models)).toBeUndefined();
      expect(calculateCost('model1', {}, 1000, Infinity, models)).toBeUndefined();
    });

    it('should return undefined if tokens are undefined', () => {
      expect(calculateCost('model1', {}, undefined, 500, models)).toBeUndefined();
      expect(calculateCost('model1', {}, 1000, undefined, models)).toBeUndefined();
    });
  });

  describe('isPromptfooSampleTarget', () => {
    it('should return true when url includes promptfoo.app', () => {
      const provider = {
        id: () => 'test',
        callApi: vi.fn(),
        config: {
          url: 'https://api.promptfoo.app/v1',
        },
      };
      expect(isPromptfooSampleTarget(provider)).toBe(true);
    });

    it('should return true when url includes promptfoo.dev', () => {
      const provider = {
        id: () => 'test',
        callApi: vi.fn(),
        config: {
          url: 'https://api.promptfoo.dev/v1',
        },
      };
      expect(isPromptfooSampleTarget(provider)).toBe(true);
    });

    it('should return false when url does not include promptfoo domains', () => {
      const provider = {
        id: () => 'test',
        callApi: vi.fn(),
        config: {
          url: 'https://api.other-domain.com/v1',
        },
      };
      expect(isPromptfooSampleTarget(provider)).toBe(false);
    });

    it('should return false when provider.config is undefined', () => {
      const provider = {
        id: () => 'test',
        callApi: vi.fn(),
      };
      expect(isPromptfooSampleTarget(provider) ?? false).toBe(false);
    });

    it('should return false when provider.config.url is undefined', () => {
      const provider = {
        id: () => 'test',
        callApi: vi.fn(),
        config: {},
      };
      expect(isPromptfooSampleTarget(provider) ?? false).toBe(false);
    });
  });

  describe('NormalizedToolChoice', () => {
    describe('isNormalizedToolChoice', () => {
      it('should return true for valid NormalizedToolChoice objects', () => {
        expect(isNormalizedToolChoice({ mode: 'auto' })).toBe(true);
        expect(isNormalizedToolChoice({ mode: 'none' })).toBe(true);
        expect(isNormalizedToolChoice({ mode: 'required' })).toBe(true);
        expect(isNormalizedToolChoice({ mode: 'tool', toolName: 'my_tool' })).toBe(true);
      });

      it('should return false for invalid inputs', () => {
        expect(isNormalizedToolChoice(null)).toBe(false);
        expect(isNormalizedToolChoice(undefined)).toBe(false);
        expect(isNormalizedToolChoice('auto')).toBe(false);
        expect(isNormalizedToolChoice({ mode: 'invalid' })).toBe(false);
        expect(isNormalizedToolChoice({ type: 'function' })).toBe(false);
        expect(isNormalizedToolChoice({})).toBe(false);
      });
    });

    describe('normalizedToolChoiceToOpenAI', () => {
      it('should convert auto mode', () => {
        expect(normalizedToolChoiceToOpenAI({ mode: 'auto' })).toBe('auto');
      });

      it('should convert none mode', () => {
        expect(normalizedToolChoiceToOpenAI({ mode: 'none' })).toBe('none');
      });

      it('should convert required mode', () => {
        expect(normalizedToolChoiceToOpenAI({ mode: 'required' })).toBe('required');
      });

      it('should convert tool mode with function object', () => {
        expect(normalizedToolChoiceToOpenAI({ mode: 'tool', toolName: 'my_function' })).toEqual({
          type: 'function',
          function: { name: 'my_function' },
        });
      });

      it('should throw error for tool mode without toolName', () => {
        expect(() => normalizedToolChoiceToOpenAI({ mode: 'tool' })).toThrow(
          'toolName is required when mode is "tool"',
        );
      });
    });

    describe('normalizedToolChoiceToAnthropic', () => {
      it('should convert auto mode', () => {
        expect(normalizedToolChoiceToAnthropic({ mode: 'auto' })).toEqual({ type: 'auto' });
      });

      it('should convert none mode to auto (Anthropic has no none)', () => {
        expect(normalizedToolChoiceToAnthropic({ mode: 'none' })).toEqual({ type: 'auto' });
      });

      it('should convert required mode to any', () => {
        expect(normalizedToolChoiceToAnthropic({ mode: 'required' })).toEqual({ type: 'any' });
      });

      it('should convert tool mode', () => {
        expect(normalizedToolChoiceToAnthropic({ mode: 'tool', toolName: 'my_tool' })).toEqual({
          type: 'tool',
          name: 'my_tool',
        });
      });

      it('should throw error for tool mode without toolName', () => {
        expect(() => normalizedToolChoiceToAnthropic({ mode: 'tool' })).toThrow(
          'toolName is required when mode is "tool"',
        );
      });
    });

    describe('normalizedToolChoiceToBedrock', () => {
      it('should convert auto mode', () => {
        expect(normalizedToolChoiceToBedrock({ mode: 'auto' })).toEqual({ auto: {} });
      });

      it('should convert none mode to undefined (Bedrock has no none)', () => {
        expect(normalizedToolChoiceToBedrock({ mode: 'none' })).toBeUndefined();
      });

      it('should convert required mode to any', () => {
        expect(normalizedToolChoiceToBedrock({ mode: 'required' })).toEqual({ any: {} });
      });

      it('should convert tool mode', () => {
        expect(normalizedToolChoiceToBedrock({ mode: 'tool', toolName: 'my_tool' })).toEqual({
          tool: { name: 'my_tool' },
        });
      });

      it('should throw error for tool mode without toolName', () => {
        expect(() => normalizedToolChoiceToBedrock({ mode: 'tool' })).toThrow(
          'toolName is required when mode is "tool"',
        );
      });
    });

    describe('normalizedToolChoiceToGoogle', () => {
      it('should convert auto mode', () => {
        expect(normalizedToolChoiceToGoogle({ mode: 'auto' })).toEqual({
          functionCallingConfig: { mode: 'AUTO' },
        });
      });

      it('should convert none mode', () => {
        expect(normalizedToolChoiceToGoogle({ mode: 'none' })).toEqual({
          functionCallingConfig: { mode: 'NONE' },
        });
      });

      it('should convert required mode to ANY', () => {
        expect(normalizedToolChoiceToGoogle({ mode: 'required' })).toEqual({
          functionCallingConfig: { mode: 'ANY' },
        });
      });

      it('should convert tool mode with allowedFunctionNames', () => {
        expect(normalizedToolChoiceToGoogle({ mode: 'tool', toolName: 'my_func' })).toEqual({
          functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['my_func'] },
        });
      });

      it('should throw error for tool mode without toolName', () => {
        expect(() => normalizedToolChoiceToGoogle({ mode: 'tool' })).toThrow(
          'toolName is required when mode is "tool"',
        );
      });
    });

    describe('transformToolChoice', () => {
      it('should pass through non-NormalizedToolChoice values', () => {
        expect(transformToolChoice('auto', 'openai')).toBe('auto');
        expect(
          transformToolChoice({ type: 'function', function: { name: 'foo' } }, 'openai'),
        ).toEqual({
          type: 'function',
          function: { name: 'foo' },
        });
      });

      it('should transform NormalizedToolChoice for OpenAI', () => {
        expect(transformToolChoice({ mode: 'auto' }, 'openai')).toBe('auto');
        expect(transformToolChoice({ mode: 'tool', toolName: 'foo' }, 'openai')).toEqual({
          type: 'function',
          function: { name: 'foo' },
        });
      });

      it('should transform NormalizedToolChoice for Anthropic', () => {
        expect(transformToolChoice({ mode: 'auto' }, 'anthropic')).toEqual({ type: 'auto' });
        expect(transformToolChoice({ mode: 'required' }, 'anthropic')).toEqual({ type: 'any' });
      });

      it('should transform NormalizedToolChoice for Bedrock', () => {
        expect(transformToolChoice({ mode: 'auto' }, 'bedrock')).toEqual({ auto: {} });
        expect(transformToolChoice({ mode: 'required' }, 'bedrock')).toEqual({ any: {} });
      });

      it('should transform NormalizedToolChoice for Google', () => {
        expect(transformToolChoice({ mode: 'auto' }, 'google')).toEqual({
          functionCallingConfig: { mode: 'AUTO' },
        });
        expect(transformToolChoice({ mode: 'none' }, 'google')).toEqual({
          functionCallingConfig: { mode: 'NONE' },
        });
      });

      it('should pass through for unknown format', () => {
        const choice = { mode: 'auto' } as const;
        expect(transformToolChoice(choice, 'unknown' as any)).toEqual(choice);
      });
    });
  });

  describe('NormalizedTool', () => {
    const sampleTools = [
      {
        normalized: true as const,
        name: 'get_weather',
        description: 'Get the current weather',
        parameters: {
          type: 'object' as const,
          properties: {
            location: { type: 'string', description: 'City name' },
            unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
          },
          required: ['location'],
        },
      },
      {
        normalized: true as const,
        name: 'search',
        description: 'Search the web',
        parameters: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ];

    describe('isNormalizedToolArray', () => {
      it('should return true for tools with normalized: true', () => {
        expect(isNormalizedToolArray(sampleTools)).toBe(true);
        expect(isNormalizedToolArray([{ normalized: true, name: 'simple_tool' }])).toBe(true);
      });

      it('should return false for tools without normalized: true', () => {
        expect(isNormalizedToolArray([{ name: 'simple_tool' }])).toBe(false);
        expect(isNormalizedToolArray([{ normalized: false, name: 'tool' }])).toBe(false);
      });

      it('should return false for empty arrays', () => {
        expect(isNormalizedToolArray([])).toBe(false);
      });

      it('should return false for non-arrays', () => {
        expect(isNormalizedToolArray(null)).toBe(false);
        expect(isNormalizedToolArray(undefined)).toBe(false);
        expect(isNormalizedToolArray('string')).toBe(false);
        expect(isNormalizedToolArray({ normalized: true, name: 'tool' })).toBe(false);
      });

      it('should return false for native provider formats (pass-through)', () => {
        // OpenAI format
        const openaiTools = [{ type: 'function', function: { name: 'test' } }];
        expect(isNormalizedToolArray(openaiTools)).toBe(false);

        // Anthropic format
        const anthropicTools = [{ name: 'test', input_schema: { type: 'object' } }];
        expect(isNormalizedToolArray(anthropicTools)).toBe(false);

        // Bedrock format
        const bedrockTools = [{ toolSpec: { name: 'test' } }];
        expect(isNormalizedToolArray(bedrockTools)).toBe(false);

        // Google format
        const googleTools = [{ functionDeclarations: [{ name: 'test' }] }];
        expect(isNormalizedToolArray(googleTools)).toBe(false);
      });
    });

    describe('normalizedToolsToOpenAI', () => {
      it('should convert to OpenAI format', () => {
        const result = normalizedToolsToOpenAI(sampleTools);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: sampleTools[0].parameters,
          },
        });
        expect(result[1]).toEqual({
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: sampleTools[1].parameters,
          },
        });
      });

      it('should handle tools without description or parameters', () => {
        const result = normalizedToolsToOpenAI([{ normalized: true, name: 'minimal' }]);

        expect(result[0]).toEqual({
          type: 'function',
          function: { name: 'minimal' },
        });
      });

      it('should include strict property when specified', () => {
        const result = normalizedToolsToOpenAI([
          { normalized: true, name: 'strict_tool', strict: true },
        ]);

        expect(result[0]).toEqual({
          type: 'function',
          function: { name: 'strict_tool', strict: true },
        });
      });
    });

    describe('normalizedToolsToAnthropic', () => {
      it('should convert to Anthropic format', () => {
        const result = normalizedToolsToAnthropic(sampleTools);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          name: 'get_weather',
          description: 'Get the current weather',
          input_schema: sampleTools[0].parameters,
        });
      });

      it('should provide default input_schema when no parameters', () => {
        const result = normalizedToolsToAnthropic([{ normalized: true, name: 'minimal' }]);

        expect(result[0]).toEqual({
          name: 'minimal',
          input_schema: { type: 'object', properties: {} },
        });
      });

      it('should include strict property when specified', () => {
        const result = normalizedToolsToAnthropic([
          { normalized: true, name: 'strict_tool', strict: true },
        ]);

        expect(result[0]).toEqual({
          name: 'strict_tool',
          input_schema: { type: 'object', properties: {} },
          strict: true,
        });
      });
    });

    describe('normalizedToolsToBedrock', () => {
      it('should convert to Bedrock Converse format', () => {
        const result = normalizedToolsToBedrock(sampleTools);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          toolSpec: {
            name: 'get_weather',
            description: 'Get the current weather',
            inputSchema: {
              json: sampleTools[0].parameters,
            },
          },
        });
      });

      it('should provide default inputSchema when no parameters', () => {
        const result = normalizedToolsToBedrock([{ normalized: true, name: 'minimal' }]);

        expect(result[0]).toEqual({
          toolSpec: {
            name: 'minimal',
            inputSchema: {
              json: { type: 'object', properties: {} },
            },
          },
        });
      });
    });

    describe('normalizedToolsToGoogle', () => {
      it('should convert to Google format with functionDeclarations array', () => {
        const result = normalizedToolsToGoogle(sampleTools);

        expect(result).toHaveLength(1);
        expect(result[0].functionDeclarations).toHaveLength(2);
        expect(result[0].functionDeclarations[0].name).toBe('get_weather');
        expect(result[0].functionDeclarations[1].name).toBe('search');
      });

      it('should convert types to uppercase', () => {
        const result = normalizedToolsToGoogle(sampleTools);

        const params = result[0].functionDeclarations[0].parameters as Record<string, unknown>;
        expect(params.type).toBe('OBJECT');
        const props = params.properties as Record<string, Record<string, unknown>>;
        expect(props.location.type).toBe('STRING');
      });

      it('should remove additionalProperties from schema', () => {
        const toolsWithAdditionalProps = [
          {
            normalized: true as const,
            name: 'test',
            parameters: {
              type: 'object' as const,
              properties: { foo: { type: 'string' } },
              additionalProperties: false,
            },
          },
        ];
        const result = normalizedToolsToGoogle(toolsWithAdditionalProps);

        const params = result[0].functionDeclarations[0].parameters as Record<string, unknown>;
        expect(params).not.toHaveProperty('additionalProperties');
      });
    });

    describe('transformTools', () => {
      it('should pass through non-NormalizedTool arrays', () => {
        const openaiTools = [{ type: 'function', function: { name: 'test' } }];
        expect(transformTools(openaiTools, 'openai')).toEqual(openaiTools);

        const anthropicTools = [{ name: 'test', input_schema: { type: 'object' } }];
        expect(transformTools(anthropicTools, 'anthropic')).toEqual(anthropicTools);
      });

      it('should transform NormalizedTool for OpenAI', () => {
        const result = transformTools(sampleTools, 'openai') as any[];
        expect(result[0].type).toBe('function');
        expect(result[0].function.name).toBe('get_weather');
      });

      it('should transform NormalizedTool for Anthropic', () => {
        const result = transformTools(sampleTools, 'anthropic') as any[];
        expect(result[0].name).toBe('get_weather');
        expect(result[0].input_schema).toBeDefined();
      });

      it('should transform NormalizedTool for Bedrock', () => {
        const result = transformTools(sampleTools, 'bedrock') as any[];
        expect(result[0].toolSpec.name).toBe('get_weather');
      });

      it('should transform NormalizedTool for Google', () => {
        const result = transformTools(sampleTools, 'google') as any[];
        expect(result[0].functionDeclarations[0].name).toBe('get_weather');
      });

      it('should pass through for unknown format', () => {
        expect(transformTools(sampleTools, 'unknown' as any)).toEqual(sampleTools);
      });
    });
  });
});
