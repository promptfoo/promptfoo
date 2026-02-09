import dedent from 'dedent';
import { describe, expect, it } from 'vitest';
import {
  calculateAnthropicCost,
  outputFromMessage,
  parseMessages,
  processAnthropicTools,
} from '../../../src/providers/anthropic/util';
import type Anthropic from '@anthropic-ai/sdk';

import type {
  WebFetchToolConfig,
  WebSearchToolConfig,
} from '../../../src/providers/anthropic/types';

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

    it('should calculate cost for Claude Opus 4 model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-20250514', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.02 * 100) + (0.02 * 200) - when config.cost is provided, it's used for both
    });

    it('should calculate cost for Claude Sonnet 4 model', () => {
      const cost = calculateAnthropicCost('claude-sonnet-4-20250514', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.02 * 100) + (0.02 * 200) - when config.cost is provided, it's used for both
    });

    it('should calculate cost for Claude Sonnet 4 latest model', () => {
      const cost = calculateAnthropicCost('claude-sonnet-4-latest', { cost: 0.02 }, 100, 200);
      expect(cost).toBe(6); // (0.02 * 100) + (0.02 * 200) - when config.cost is provided, it's used for both
    });

    it('should calculate default cost for Claude Opus 4.1 model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-1-20250805', {}, 100, 200);
      expect(cost).toBe(0.0165); // (0.000015 * 100) + (0.000075 * 200) - using default model costs
    });

    it('should calculate default cost for Claude Opus 4 model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-20250514', {}, 100, 200);
      expect(cost).toBe(0.0165); // (0.000015 * 100) + (0.000075 * 200) - using default model costs
    });

    it('should calculate default cost for Claude Sonnet 4 model', () => {
      const cost = calculateAnthropicCost('claude-sonnet-4-20250514', {}, 100, 200);
      expect(cost).toBe(0.0033); // (0.000003 * 100) + (0.000015 * 200) - using default model costs
    });

    it('should calculate default cost for Claude Sonnet 4.5 model', () => {
      const cost = calculateAnthropicCost('claude-sonnet-4-5-20250929', {}, 100, 200);
      expect(cost).toBe(0.0033); // (0.000003 * 100) + (0.000015 * 200) - using Sonnet 4 pricing
    });

    it('should calculate default cost for Claude Haiku 4.5 model', () => {
      const cost = calculateAnthropicCost('claude-haiku-4-5-20251001', {}, 100, 200);
      expect(cost).toBe(0.0011); // (0.000001 * 100) + (0.000005 * 200) - $1/MTok input, $5/MTok output
    });

    it('should calculate default cost for Claude Haiku 4.5 latest model', () => {
      const cost = calculateAnthropicCost('claude-haiku-4-5-latest', {}, 100, 200);
      expect(cost).toBe(0.0011); // (0.000001 * 100) + (0.000005 * 200) - $1/MTok input, $5/MTok output
    });

    it('should calculate default cost for Claude Opus 4.6 model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-6', {}, 100, 200);
      expect(cost).toBe(0.0055); // (0.000005 * 100) + (0.000025 * 200) - $5/MTok input, $25/MTok output
    });

    it('should calculate default cost for Claude Opus 4.5 model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-5-20251101', {}, 100, 200);
      expect(cost).toBe(0.0055); // (0.000005 * 100) + (0.000025 * 200) - $5/MTok input, $25/MTok output
    });

    it('should calculate default cost for Claude Opus 4.5 latest model', () => {
      const cost = calculateAnthropicCost('claude-opus-4-5-latest', {}, 100, 200);
      expect(cost).toBe(0.0055); // (0.000005 * 100) + (0.000025 * 200) - $5/MTok input, $25/MTok output
    });

    it('should calculate tiered cost for Claude Sonnet 4.5 with prompt <= 200k tokens', () => {
      // Test with 150k tokens (below threshold)
      const cost = calculateAnthropicCost('claude-sonnet-4-5-20250929', {}, 150_000, 10_000);
      expect(cost).toBe(0.6); // (3/1e6 * 150,000) + (15/1e6 * 10,000) = 0.45 + 0.15 = 0.6
    });

    it('should calculate tiered cost for Claude Sonnet 4.5 with prompt exactly 200k tokens', () => {
      // Test with exactly 200k tokens (at threshold, should use lower tier)
      const cost = calculateAnthropicCost('claude-sonnet-4-5-20250929', {}, 200_000, 10_000);
      expect(cost).toBe(0.75); // (3/1e6 * 200,000) + (15/1e6 * 10,000) = 0.6 + 0.15 = 0.75
    });

    it('should calculate tiered cost for Claude Sonnet 4.5 with prompt > 200k tokens', () => {
      // Test with 250k tokens (above threshold)
      const cost = calculateAnthropicCost('claude-sonnet-4-5-20250929', {}, 250_000, 10_000);
      expect(cost).toBe(1.725); // (6/1e6 * 250,000) + (22.5/1e6 * 10,000) = 1.5 + 0.225 = 1.725
    });

    it('should calculate tiered cost for Claude Sonnet 4.5 20250929 with > 200k tokens', () => {
      // Only claude-sonnet-4-5-20250929 has tiered pricing
      const cost = calculateAnthropicCost('claude-sonnet-4-5-20250929', {}, 300_000, 20_000);
      // (6/1e6 * 300,000) + (22.5/1e6 * 20,000) = 1.8 + 0.45 = 2.25
      expect(cost).toBe(2.25);
    });

    it('should use base pricing for other Claude Sonnet 4 models', () => {
      // Other Sonnet 4 models don't have tiered pricing
      const models = ['claude-sonnet-4-20250514', 'claude-sonnet-4-0', 'claude-sonnet-4-latest'];

      models.forEach((model) => {
        const cost = calculateAnthropicCost(model, {}, 300_000, 20_000);
        // (3/1e6 * 300,000) + (15/1e6 * 20,000) = 0.9 + 0.3 = 1.2
        expect(cost).toBe(1.2);
      });
    });

    it('should respect config.cost override for Claude Sonnet 4.5 models', () => {
      // When config.cost is provided, it should override tiered pricing
      const cost = calculateAnthropicCost(
        'claude-sonnet-4-5-20250929',
        { cost: 0.02 },
        250_000,
        10_000,
      );
      expect(cost).toBe(5200); // (0.02 * 250,000) + (0.02 * 10,000) = 5000 + 200 = 5200
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
                file_id: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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
          cache_creation: null,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          server_tool_use: null,
          service_tier: null,
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

  describe('processAnthropicTools', () => {
    it('should handle empty tools array', () => {
      const { processedTools, requiredBetaFeatures } = processAnthropicTools([]);

      expect(processedTools).toEqual([]);
      expect(requiredBetaFeatures).toEqual([]);
    });

    it('should pass through standard Anthropic tools unchanged', () => {
      const standardTool: Anthropic.Tool = {
        name: 'get_weather',
        description: 'Get weather information',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([standardTool]);

      expect(processedTools).toEqual([standardTool]);
      expect(requiredBetaFeatures).toEqual([]);
    });

    it('should process web_fetch_20250910 tool and add beta feature', () => {
      const webFetchTool: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 5,
        allowed_domains: ['example.com'],
        citations: { enabled: true },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([webFetchTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toMatchObject({
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 5,
        allowed_domains: ['example.com'],
        citations: { enabled: true },
      });
      expect(requiredBetaFeatures).toEqual(['web-fetch-2025-09-10']);
    });

    it('should process web_search_20250305 tool without adding beta feature', () => {
      const webSearchTool: WebSearchToolConfig = {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([webSearchTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toMatchObject({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      });
      expect(requiredBetaFeatures).toEqual([]);
    });

    it('should handle mixed tool types', () => {
      const standardTool: Anthropic.Tool = {
        name: 'calculate',
        description: 'Perform calculations',
        input_schema: {
          type: 'object',
          properties: {
            expression: { type: 'string' },
          },
        },
      };

      const webFetchTool: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 2,
        blocked_domains: ['spam.com'],
      };

      const webSearchTool: WebSearchToolConfig = {
        type: 'web_search_20250305',
        name: 'web_search',
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([
        standardTool,
        webFetchTool,
        webSearchTool,
      ]);

      expect(processedTools).toHaveLength(3);
      expect(processedTools[0]).toEqual(standardTool);
      expect(processedTools[1]).toMatchObject({
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 2,
        blocked_domains: ['spam.com'],
      });
      expect(processedTools[2]).toMatchObject({
        type: 'web_search_20250305',
        name: 'web_search',
      });
      expect(requiredBetaFeatures).toEqual(['web-fetch-2025-09-10']);
    });

    it('should handle web_fetch tool with all optional parameters', () => {
      const webFetchTool: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 10,
        allowed_domains: ['docs.example.com', 'help.example.com'],
        blocked_domains: ['ads.example.com'],
        citations: { enabled: true },
        max_content_tokens: 50000,
        cache_control: { type: 'ephemeral' },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([webFetchTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toMatchObject({
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 10,
        allowed_domains: ['docs.example.com', 'help.example.com'],
        blocked_domains: ['ads.example.com'],
        citations: { enabled: true },
        max_content_tokens: 50000,
        cache_control: { type: 'ephemeral' },
      });
      expect(requiredBetaFeatures).toEqual(['web-fetch-2025-09-10']);
    });

    it('should handle web_fetch tool with minimal configuration', () => {
      const webFetchTool: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([webFetchTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toMatchObject({
        type: 'web_fetch_20250910',
        name: 'web_fetch',
      });
      expect(requiredBetaFeatures).toEqual(['web-fetch-2025-09-10']);
    });

    it('should not duplicate beta features', () => {
      const webFetchTool1: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 2,
      };

      const webFetchTool2: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 3,
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([
        webFetchTool1,
        webFetchTool2,
      ]);

      expect(processedTools).toHaveLength(2);
      expect(requiredBetaFeatures).toEqual(['web-fetch-2025-09-10']);
    });

    it('should add structured-outputs beta for tools with strict mode', () => {
      const strictTool: Anthropic.Tool & { strict: boolean } = {
        name: 'get_weather',
        description: 'Get weather information',
        strict: true,
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
          additionalProperties: false,
        },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([strictTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toEqual(strictTool);
      expect(requiredBetaFeatures).toEqual(['structured-outputs-2025-11-13']);
    });

    it('should not add structured-outputs beta for tools without strict mode', () => {
      const nonStrictTool: Anthropic.Tool = {
        name: 'get_weather',
        description: 'Get weather information',
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
          required: ['location'],
        },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([nonStrictTool]);

      expect(processedTools).toHaveLength(1);
      expect(processedTools[0]).toEqual(nonStrictTool);
      expect(requiredBetaFeatures).toEqual([]);
    });

    it('should not add structured-outputs beta when strict is false', () => {
      const nonStrictTool: Anthropic.Tool & { strict: boolean } = {
        name: 'get_weather',
        description: 'Get weather information',
        strict: false,
        input_schema: {
          type: 'object',
          properties: {
            location: { type: 'string' },
          },
        },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([nonStrictTool]);

      expect(processedTools).toHaveLength(1);
      expect(requiredBetaFeatures).toEqual([]);
    });

    it('should handle multiple strict tools without duplicating beta features', () => {
      const strictTool1: Anthropic.Tool & { strict: boolean } = {
        name: 'get_weather',
        description: 'Get weather',
        strict: true,
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
          additionalProperties: false,
        },
      };

      const strictTool2: Anthropic.Tool & { strict: boolean } = {
        name: 'get_time',
        description: 'Get time',
        strict: true,
        input_schema: {
          type: 'object',
          properties: { timezone: { type: 'string' } },
          required: ['timezone'],
          additionalProperties: false,
        },
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([
        strictTool1,
        strictTool2,
      ]);

      expect(processedTools).toHaveLength(2);
      expect(requiredBetaFeatures).toEqual(['structured-outputs-2025-11-13']);
    });

    it('should combine multiple beta features correctly', () => {
      const strictTool: Anthropic.Tool & { strict: boolean } = {
        name: 'calculate',
        description: 'Perform calculation',
        strict: true,
        input_schema: {
          type: 'object',
          properties: { expression: { type: 'string' } },
          required: ['expression'],
          additionalProperties: false,
        },
      };

      const webFetchTool: WebFetchToolConfig = {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 5,
      };

      const { processedTools, requiredBetaFeatures } = processAnthropicTools([
        strictTool,
        webFetchTool,
      ]);

      expect(processedTools).toHaveLength(2);
      expect(requiredBetaFeatures).toContain('structured-outputs-2025-11-13');
      expect(requiredBetaFeatures).toContain('web-fetch-2025-09-10');
      expect(requiredBetaFeatures).toHaveLength(2);
    });
  });
});
