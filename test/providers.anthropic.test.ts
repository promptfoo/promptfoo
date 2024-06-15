import { AwsBedrockCompletionProvider } from '../src/providers/bedrock';
import {
  AnthropicCompletionProvider,
  AnthropicMessagesProvider,
  outputFromMessage,
} from '../src/providers/anthropic';
import { clearCache, disableCache, enableCache, getCache } from '../src/cache';
import { loadApiProvider } from '../src/providers';
import Anthropic from '@anthropic-ai/sdk';
import dedent from 'dedent';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('Anthropic', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('outputFromMessage', () => {
    test('should return an empty string for empty content array', () => {
      const message: Anthropic.Messages.Message = {
        content: [],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: undefined,
      };

      const result = outputFromMessage(message);
      expect(result).toBe('');
    });

    test('should return text from a single text block', () => {
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

    test('should concatenate text blocks without tool_use blocks', () => {
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

    test('should handle content with tool_use blocks', () => {
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

    test('should concatenate text and tool_use blocks as JSON strings', () => {
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

  describe('AnthropicMessagesProvider callApi', () => {
    test('should use cache by default for ToolUse requests', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
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

    test('should not use cache if caching is disabled for ToolUse requests', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
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

    test('should return cached response for legacy caching behavior', async () => {
      const provider = new AnthropicMessagesProvider('claude-3-opus-20240229');
      provider.anthropic.messages.create = jest.fn().mockResolvedValue({
        content: [],
      } as unknown as Anthropic.Messages.Message);
      getCache().set(
        'anthropic:{"model":"claude-3-opus-20240229","messages":[{"role":"user","content":[{"type":"text","text":"What is the forecast in San Francisco?"}]}],"max_tokens":1024,"temperature":0,"stream":false}',
        'Test output',
      );
      const result = await provider.callApi('What is the forecast in San Francisco?');
      expect(result).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(0);
    });
  });

  describe('AnthropicCompletionProvider callApi', () => {
    test('should return output for default behavior', async () => {
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

    test('should return cached output with caching enabled', async () => {
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

      (provider.anthropic.completions.create as jest.Mock).mockClear();
      const cachedResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(0);
      expect(cachedResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });

    test('should return fresh output with caching disabled', async () => {
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

      (provider.anthropic.completions.create as jest.Mock).mockClear();

      disableCache();

      const freshResult = await provider.callApi('Test prompt');

      expect(provider.anthropic.completions.create).toHaveBeenCalledTimes(1);
      expect(freshResult).toMatchObject({
        output: 'Test output',
        tokenUsage: {},
      });
    });
  });
});

test('loadApiProvider with bedrock:completion', async () => {
  await expect(loadApiProvider('bedrock:completion:anthropic.claude-v2:1')).resolves.toBeInstanceOf(
    AwsBedrockCompletionProvider,
  );
});
