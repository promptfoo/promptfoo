import Anthropic from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { AwsBedrockCompletionProvider } from '../src/providers/bedrock';
import {
  AnthropicCompletionProvider,
  AnthropicMessagesProvider,
  calculateCost,
  outputFromMessage,
  parseMessages,
} from '../src/providers/anthropic';
import { clearCache, disableCache, enableCache, getCache } from '../src/cache';
import { loadApiProvider } from '../src/providers';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('Anthropic', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('AnthropicMessagesProvider callApi', () => {
    const tools: Anthropic.Tool[] = [
      {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA',
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
            },
          },
          required: ['location'],
        },
      },
    ];

    const provider = new AnthropicMessagesProvider('claude-3-opus-20240229', {
      config: { tools },
    });

    it('should use cache by default for ToolUse requests', async () => {
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
          },
          {
            type: 'tool_use',
            id: 'toolu_01A09q90qw90lq917835lq9',
            name: 'get_weather',
            input: { location: 'San Francisco, CA', unit: 'celsius' },
          },
        ],
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(1, {
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                text: 'What is the forecast in San Francisco?',
                type: 'text',
              },
            ],
          },
        ],
        tools,
        temperature: 0,
        stream: false,
      });

      expect(result).toMatchObject({
        cost: undefined,
        output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

          {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
        tokenUsage: {},
      });

      const resultFromCache = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject(resultFromCache);
    });

    it('should pass the tool choice if specified', async () => {
      const toolChoice: Anthropic.MessageCreateParams.ToolChoiceTool = {
        name: 'get_weather',
        type: 'tool',
      };
      provider.config.tool_choice = toolChoice;
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
          },
          {
            type: 'tool_use',
            id: 'toolu_01A09q90qw90lq917835lq9',
            name: 'get_weather',
            input: { location: 'San Francisco, CA', unit: 'celsius' },
          },
        ],
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(1, {
        model: 'claude-3-opus-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                text: 'What is the forecast in San Francisco?',
                type: 'text',
              },
            ],
          },
        ],
        tools,
        tool_choice: toolChoice,
        temperature: 0,
        stream: false,
      });

      provider.config.tool_choice = undefined;
    });

    it('should not use cache if caching is disabled for ToolUse requests', async () => {
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>',
          },
          {
            type: 'tool_use',
            id: 'toolu_01A09q90qw90lq917835lq9',
            name: 'get_weather',
            input: { location: 'San Francisco, CA', unit: 'celsius' },
          },
        ],
      } as Anthropic.Messages.Message);

      disableCache();

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);

      expect(result).toMatchObject({
        output: dedent`<thinking>I need to use the get_weather, and the user wants SF, which is likely San Francisco, CA.</thinking>

          {"type":"tool_use","id":"toolu_01A09q90qw90lq917835lq9","name":"get_weather","input":{"location":"San Francisco, CA","unit":"celsius"}}`,
        tokenUsage: {},
      });

      await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(2);
      enableCache();
    });

    it('should return cached response for legacy caching behavior', async () => {
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [],
      } as unknown as Anthropic.Messages.Message);
      getCache().set(
        'anthropic:{"model":"claude-3-opus-20240229","max_tokens":1024,"messages":[{"role":"user","content":[{"type":"text","text":"What is the forecast in San Francisco?"}]}],"stream":false,"temperature":0,"tools":[{"name":"get_weather","description":"Get the current weather in a given location","input_schema":{"type":"object","properties":{"location":{"type":"string","description":"The city and state, e.g. San Francisco, CA"},"unit":{"type":"string","enum":["celsius","fahrenheit"]}},"required":["location"]}}]}',
        'Test output',
      );
      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(0);
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
      provider.anthropic.messages.create = jest
        .fn()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });

    it('should return token usage and cost', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-opus-20240229', {
        config: { max_tokens: 100, temperature: 0.5, cost: 0.015 },
      });
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Test output' }],
        usage: { input_tokens: 50, output_tokens: 50 },
      } as Anthropic.Messages.Message);

      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: { total: 100, prompt: 50, completion: 50 },
        cost: 1.5,
      });
    });
  });

  describe('AnthropicCompletionProvider callApi', () => {
    it('should return output for default behavior', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      provider.anthropic.completions.create = jest.fn().mockResolvedValue({
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return cached output with caching enabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      provider.anthropic.completions.create = jest.fn().mockResolvedValue({
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
      expect(cachedResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should return fresh output with caching disabled', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      provider.anthropic.completions.create = jest.fn().mockResolvedValue({
        completion: 'Test output',
      });
      const result = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });

      jest.mocked(provider.anthropic.completions.create).mockClear();

      disableCache();

      const freshResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(freshResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    it('should handle API call error', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      provider.anthropic.completions.create = jest
        .fn()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('Test prompt');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for valid input and output tokens', () => {
      const cost = calculateCost('claude-3-opus-20240229', { cost: 0.015 }, 100, 200);

      expect(cost).toBe(4.5); // (0.015 * 100) + (0.075 * 200)
    });

    it('should return undefined for missing model', () => {
      const cost = calculateCost('non-existent-model', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });

    it('should return undefined for missing tokens', () => {
      const cost = calculateCost('claude-3-opus-20240229', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });
  });

  describe('outputFromMessage', () => {
    it('should return an empty string for empty content array', () => {
      const message: Anthropic.Messages.Message = {
        content: [],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('');
    });

    it('should return text from a single text block', () => {
      const message: Anthropic.Messages.Message = {
        content: [{ type: 'text', text: 'Hello' }],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('Hello');
    });

    it('should concatenate text blocks without tool_use blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('Hello\n\nWorld');
    });

    it('should handle content with tool_use blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'get_weather',
            input: { location: 'San Francisco, CA' },
          },
          {
            type: 'tool_use',
            id: 'tool2',
            name: 'get_time',
            input: { location: 'New York, NY' },
          },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe(
        '{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\n{"type":"tool_use","id":"tool2","name":"get_time","input":{"location":"New York, NY"}}',
      );
    });

    it('should concatenate text and tool_use blocks as JSON strings', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'get_weather',
            input: { location: 'San Francisco, CA' },
          },
          { type: 'text', text: 'World' },
        ],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe(
        'Hello\n\n{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\nWorld',
      );
    });
  });

  describe('parseMessages', () => {
    it('should parse messages with user and assistant roles', () => {
      const inputMessages = dedent`user: What is the weather?
          assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toMatchObject([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: dedent`user: What is the weather?
                    assistant: The weather is sunny.`,
            },
          ],
        },
      ]);
    });

    it('should handle system messages', () => {
      const inputMessages = dedent`system: This is a system message.
        user: What is the weather?
        assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toMatchObject([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: dedent`system: This is a system message.
              user: What is the weather?
              assistant: The weather is sunny.`,
            },
          ],
        },
      ]);
    });

    it('should handle empty input', () => {
      const inputMessages = '';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toMatchObject([
        {
          role: 'user',
          content: [{ type: 'text', text: '' }],
        },
      ]);
    });
  });
});

// NOTE: test suite fails with: ReferenceError: Cannot access 'AnthropicCompletionProvider' before initialization
// if this is removed. The test can even be skipped. This is likely due to a circular dependency.
test('loadApiProvider with bedrock:completion', async () => {
  await expect(loadApiProvider('bedrock:completion:anthropic.claude-v2:1')).resolves.toBeInstanceOf(
    AwsBedrockCompletionProvider,
  );
});
