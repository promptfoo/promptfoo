import { describe, expect, it } from 'vitest';
import { extractToolCalls } from '../../src/assertions/trajectoryUtils';

import type { ProviderResponse } from '../../src/types/index';

describe('extractToolCalls', () => {
  describe('metadata.toolCalls (agent SDK format)', () => {
    it('should extract from metadata.toolCalls', () => {
      const providerResponse: ProviderResponse = {
        output: 'some output',
        metadata: {
          toolCalls: [
            {
              id: '1',
              name: 'search',
              input: { query: 'test' },
              output: 'result',
              is_error: false,
            },
            { id: '2', name: 'reply', input: { text: 'hi' }, output: 'done', is_error: false },
          ],
        },
      };

      const result = extractToolCalls('some output', providerResponse);

      expect(result).toEqual([
        { name: 'search', args: { query: 'test' } },
        { name: 'reply', args: { text: 'hi' } },
      ]);
    });

    it('should prefer metadata.toolCalls over output', () => {
      const providerResponse: ProviderResponse = {
        output: { tool_calls: [{ function: { name: 'from_output', arguments: '{}' } }] },
        metadata: {
          toolCalls: [{ id: '1', name: 'from_metadata', input: {}, output: '', is_error: false }],
        },
      };

      const result = extractToolCalls(providerResponse.output, providerResponse);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('from_metadata');
    });
  });

  describe('OpenAI format', () => {
    it('should extract from tool_calls with function', () => {
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
          { function: { name: 'book_flight', arguments: '{"dest":"Paris"}' } },
        ],
      };

      const result = extractToolCalls(output);

      expect(result).toEqual([
        { name: 'get_weather', args: { city: 'NYC' } },
        { name: 'book_flight', args: { dest: 'Paris' } },
      ]);
    });

    it('should handle object arguments', () => {
      const output = {
        tool_calls: [{ function: { name: 'search', arguments: { query: 'test' } } }],
      };

      const result = extractToolCalls(output);

      expect(result).toEqual([{ name: 'search', args: { query: 'test' } }]);
    });
  });

  describe('Anthropic format', () => {
    it('should extract from single tool_use block', () => {
      const output = { type: 'tool_use', name: 'search', input: { query: 'test' } };

      const result = extractToolCalls(output);

      expect(result).toEqual([{ name: 'search', args: { query: 'test' } }]);
    });

    it('should extract from array of content blocks', () => {
      const output = [
        { type: 'text', text: 'Let me search' },
        { type: 'tool_use', name: 'search', input: { query: 'test' } },
        { type: 'tool_use', name: 'reply', input: { text: 'found it' } },
      ];

      const result = extractToolCalls(output);

      expect(result).toEqual([
        { name: 'search', args: { query: 'test' } },
        { name: 'reply', args: { text: 'found it' } },
      ]);
    });
  });

  describe('Google/Vertex format', () => {
    it('should extract from functionCall', () => {
      const output = { functionCall: { name: 'search', args: { query: 'test' } } };

      const result = extractToolCalls(output);

      expect(result).toEqual([{ name: 'search', args: { query: 'test' } }]);
    });

    it('should extract from toolCall.functionCalls', () => {
      const output = {
        toolCall: {
          functionCalls: [
            { name: 'search', args: { query: 'test' } },
            { name: 'reply', args: { text: 'result' } },
          ],
        },
      };

      const result = extractToolCalls(output);

      expect(result).toEqual([
        { name: 'search', args: { query: 'test' } },
        { name: 'reply', args: { text: 'result' } },
      ]);
    });
  });

  describe('String output', () => {
    it('should parse JSON string', () => {
      const output = JSON.stringify({
        tool_calls: [{ function: { name: 'search', arguments: '{}' } }],
      });

      const result = extractToolCalls(output);

      expect(result).toEqual([{ name: 'search', args: {} }]);
    });

    it('should parse multiline with JSON', () => {
      const output =
        'Let me search for that.\n\n{"type":"tool_use","name":"search","input":{"q":"test"}}';

      const result = extractToolCalls(output);

      expect(result).toEqual([{ name: 'search', args: { q: 'test' } }]);
    });
  });

  describe('Edge cases', () => {
    it('should return empty array for null output', () => {
      expect(extractToolCalls(null)).toEqual([]);
    });

    it('should return empty array for undefined output', () => {
      expect(extractToolCalls(undefined)).toEqual([]);
    });

    it('should return empty array for plain string', () => {
      expect(extractToolCalls('just a plain response')).toEqual([]);
    });

    it('should return empty array for number', () => {
      expect(extractToolCalls(42)).toEqual([]);
    });
  });
});
