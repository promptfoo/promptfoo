import type Anthropic from '@anthropic-ai/sdk';
import dedent from 'dedent';
import { clearCache, disableCache, enableCache, getCache } from '../../src/cache';
import {
  AnthropicCompletionProvider,
  AnthropicLlmRubricProvider,
  AnthropicMessagesProvider,
  calculateAnthropicCost,
  outputFromMessage,
  parseMessages,
} from '../../src/providers/anthropic';

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
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
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
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(
        1,
        {
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
        },
        {},
      );

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
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
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

      await provider.callApi('What is the forecast in San Francisco?');
      expect(provider.anthropic.messages.create).toHaveBeenCalledTimes(1);
      expect(provider.anthropic.messages.create).toHaveBeenNthCalledWith(
        1,
        {
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
        },
        {},
      );

      provider.config.tool_choice = undefined;
    });

    it('should not use cache if caching is disabled for ToolUse requests', async () => {
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
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
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
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
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
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
      jest
        .spyOn(provider.anthropic.messages, 'create')
        .mockImplementation()
        .mockResolvedValue({
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

  describe('AnthropicLlmRubricProvider', () => {
    let provider: AnthropicLlmRubricProvider;

    beforeEach(() => {
      provider = new AnthropicLlmRubricProvider('claude-3-5-sonnet-20240620');
    });

    it('should initialize with forced tool configuration', () => {
      expect(provider.modelName).toBe('claude-3-5-sonnet-20240620');
      expect(provider.config.tool_choice).toEqual({ type: 'tool', name: 'grade_output' });
    });

    it('should call API and parse the result correctly', async () => {
      const mockApiResponse = {
        output: JSON.stringify({
          type: 'tool_use',
          id: 'test-id',
          name: 'grade_output',
          input: {
            pass: true,
            score: 0.85,
            reason: 'The output meets the criteria.',
          },
        }),
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result).toEqual({
        output: {
          pass: true,
          score: 0.85,
          reason: 'The output meets the criteria.',
        },
      });
    });

    it('should handle non-string API response', async () => {
      const mockApiResponse = {
        output: { confession: 'I am not a string' },
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - malformed non-string output');
    });

    it('should handle malformed API response', async () => {
      const mockApiResponse = {
        output: 'Invalid JSON',
      };

      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockResolvedValue(mockApiResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.error).toContain('Anthropic LLM rubric grader - invalid JSON');
    });

    it('should handle API errors', async () => {
      const mockError = new Error('API Error');
      jest.spyOn(AnthropicMessagesProvider.prototype, 'callApi').mockRejectedValue(mockError);

      await expect(provider.callApi('Test prompt')).rejects.toThrow('API Error');
    });
  });

  describe('AnthropicCompletionProvider callApi', () => {
    it('should return output for default behavior', async () => {
      const provider = new AnthropicCompletionProvider('claude-1');
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
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
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
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
      jest.spyOn(provider.anthropic.completions, 'create').mockImplementation().mockResolvedValue({
        id: 'test-id',
        model: 'claude-1',
        stop_reason: 'stop_sequence',
        type: 'completion',
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
      jest
        .spyOn(provider.anthropic.completions, 'create')
        .mockImplementation()
        .mockRejectedValue(new Error('API call failed'));

      const result = await provider.callApi('Test prompt');
      expect(result).toMatchObject({
        error: 'API call error: Error: API call failed',
      });
    });
  });

  describe('calculateAnthropicCost', () => {
    it('should calculate cost for valid input and output tokens', () => {
      const cost = calculateAnthropicCost('claude-3-opus-20240229', { cost: 0.015 }, 100, 200);

      expect(cost).toBe(4.5); // (0.015 * 100) + (0.075 * 200)
    });

    it('should return undefined for missing model', () => {
      const cost = calculateAnthropicCost('non-existent-model', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });

    it('should return undefined for missing tokens', () => {
      const cost = calculateAnthropicCost('claude-3-opus-20240229', { cost: 0.015 });

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
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('');
    });

    it('should return text from a single text block', () => {
      const message: Anthropic.Messages.Message = {
        content: [{ type: 'text', text: 'Hello', citations: [] }],
        id: '',
        model: '',
        role: 'assistant',
        stop_reason: null,
        stop_sequence: null,
        type: 'message',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('Hello');
    });

    it('should concatenate text blocks without tool_use blocks', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          { type: 'text', text: 'World', citations: [] },
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
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
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
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
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
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'tool_use',
            id: 'tool1',
            name: 'get_weather',
            input: { location: 'San Francisco, CA' },
          },
          { type: 'text', text: 'World', citations: [] },
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
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe(
        'Hello\n\n{"type":"tool_use","id":"tool1","name":"get_weather","input":{"location":"San Francisco, CA"}}\n\nWorld',
      );
    });

    it('should handle text blocks with citations', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          {
            type: 'text',
            text: 'The sky is blue',
            citations: [
              {
                type: 'char_location',
                cited_text: 'The sky is blue.',
                document_index: 0,
                document_title: 'Nature Facts',
                start_char_index: 0,
                end_char_index: 15,
              },
            ],
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
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };

      const result = outputFromMessage(message);
      expect(result).toBe('The sky is blue');
    });
  });

  describe('parseMessages', () => {
    it('should parse messages with user and assistant roles', () => {
      const inputMessages = dedent`user: What is the weather?
          assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny.' }],
        },
      ]);
    });

    it('should handle system messages', () => {
      const inputMessages = dedent`system: This is a system message.
        user: What is the weather?
        assistant: The weather is sunny.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'This is a system message.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'What is the weather?' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'The weather is sunny.' }],
        },
      ]);
    });

    it('should handle empty input', () => {
      const inputMessages = '';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: '' }],
        },
      ]);
    });

    it('should handle only system message', () => {
      const inputMessages = 'system: This is a system message.';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'This is a system message.' }]);
      expect(extractedMessages).toEqual([]);
    });

    it('should handle messages with image content', () => {
      const inputMessages = dedent`user: Here's an image: [image-1.jpg]
        assistant: I see the image.`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: "Here's an image: [image-1.jpg]" }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I see the image.' }],
        },
      ]);
    });

    it('should handle multiple messages of the same role', () => {
      const inputMessages = dedent`
        user: First question
        user: Second question
        assistant: Here's the answer`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'First question' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second question' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: "Here's the answer" }],
        },
      ]);
    });

    it('should handle a single user message', () => {
      const inputMessages = 'Hello, Claude';

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello, Claude' }],
        },
      ]);
    });

    it('should handle multi-line messages', () => {
      const inputMessages = dedent`
        user: This is a
        multi-line
        message
        assistant: And this is a
        multi-line response`;

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'This is a\nmulti-line\nmessage' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'And this is a\nmulti-line response' }],
        },
      ]);
    });

    it('should parse JSON message array with image content', () => {
      const inputMessages = JSON.stringify([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toBeUndefined();
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: "What's in this image?" },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
      ]);
    });

    it('should parse JSON message array with mixed content types', () => {
      const inputMessages = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
        { role: 'assistant', content: 'I see a beautiful landscape.' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'You are a helpful assistant.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image:' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'base64EncodedImageData',
              },
            },
          ],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'I see a beautiful landscape.' }],
        },
      ]);
    });

    it('should handle system messages in JSON array format', () => {
      const inputMessages = JSON.stringify([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([{ type: 'text', text: 'You are a helpful assistant.' }]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello!' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there!' }],
        },
      ]);
    });

    it('should handle system messages with array content in JSON format', () => {
      const inputMessages = JSON.stringify([
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' },
            { type: 'text', text: 'Additional system context.' },
          ],
        },
        { role: 'user', content: 'Hello!' },
      ]);

      const { system, extractedMessages } = parseMessages(inputMessages);

      expect(system).toEqual([
        { type: 'text', text: 'You are a helpful assistant.' },
        { type: 'text', text: 'Additional system context.' },
      ]);
      expect(extractedMessages).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello!' }],
        },
      ]);
    });
  });
});
