import type Anthropic from '@anthropic-ai/sdk';
import dedent from 'dedent';
import {
  calculateAnthropicCost,
  outputFromMessage,
  parseMessages,
} from '../../../src/providers/anthropic/util';

describe('Anthropic utilities', () => {
  describe('calculateAnthropicCost', () => {
    it('should calculate cost for valid input and output tokens', () => {
      const cost = calculateAnthropicCost('claude-3-5-sonnet-20241022', { cost: 0.015 }, 100, 200);
      expect(cost).toBe(4.5); // (0.003 * 100) + (0.015 * 200)
    });

    it('should calculate cost for Claude 3.7 model', () => {
      const cost = calculateAnthropicCost('claude-3-7-sonnet-20250219', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.004 * 100) + (0.02 * 200)
    });

    it('should calculate cost for Claude 3.7 latest model', () => {
      const cost = calculateAnthropicCost('claude-3-7-sonnet-latest', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.004 * 100) + (0.02 * 200)
    });

    it('should return undefined for missing model', () => {
      const cost = calculateAnthropicCost('non-existent-model', { cost: 0.015 });

      expect(cost).toBeUndefined();
    });

    it('should return undefined for missing tokens', () => {
      const cost = calculateAnthropicCost('claude-3-5-sonnet-20241022', { cost: 0.015 });

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

      const result = outputFromMessage(message, false);
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

      const result = outputFromMessage(message, false);
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

      const result = outputFromMessage(message, false);
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

      const result = outputFromMessage(message, false);
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

      const result = outputFromMessage(message, false);
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

      const result = outputFromMessage(message, false);
      expect(result).toBe('The sky is blue');
    });

    it('should include thinking blocks when showThinking is true', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'thinking',
            thinking: 'I need to consider the weather',
            signature: 'abc123',
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

      const result = outputFromMessage(message, true);
      expect(result).toBe(
        'Hello\n\nThinking: I need to consider the weather\nSignature: abc123\n\nWorld',
      );
    });

    it('should exclude thinking blocks when showThinking is false', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'thinking',
            thinking: 'I need to consider the weather',
            signature: 'abc123',
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

      const result = outputFromMessage(message, false);
      expect(result).toBe('Hello\n\nWorld');
    });

    it('should include redacted_thinking blocks when showThinking is true', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'redacted_thinking',
            data: 'Some redacted thinking data',
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

      const result = outputFromMessage(message, true);
      expect(result).toBe('Hello\n\nRedacted Thinking: Some redacted thinking data\n\nWorld');
    });

    it('should exclude redacted_thinking blocks when showThinking is false', () => {
      const message: Anthropic.Messages.Message = {
        content: [
          { type: 'text', text: 'Hello', citations: [] },
          {
            type: 'redacted_thinking',
            data: 'Some redacted thinking data',
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

      const result = outputFromMessage(message, false);
      expect(result).toBe('Hello\n\nWorld');
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
