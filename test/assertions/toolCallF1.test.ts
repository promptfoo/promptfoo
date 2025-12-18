import { describe, expect, it } from 'vitest';
import { handleToolCallF1 } from '../../src/assertions/toolCallF1';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const createParams = (
  output: unknown,
  expectedTools: string | string[],
  options: { threshold?: number; inverse?: boolean } = {},
): AssertionParams => ({
  baseType: 'tool-call-f1' as const,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: output as string | object },
  },
  output: output as string | object,
  outputString: typeof output === 'string' ? output : JSON.stringify(output),
  providerResponse: { output: output as string | object },
  test: {} as AtomicTestCase,
  assertion: { type: 'tool-call-f1', value: expectedTools, threshold: options.threshold },
  renderedValue: expectedTools,
  inverse: options.inverse ?? false,
});

describe('handleToolCallF1', () => {
  describe('F1 score calculation', () => {
    it('should return F1=1.0 when actual tools exactly match expected tools', () => {
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'book_flight', arguments: '{}' } },
        ],
      };
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
      expect(result.reason).toContain('precision=1.000');
      expect(result.reason).toContain('recall=1.000');
    });

    it('should return F1=0 when no tools match', () => {
      const output = {
        tool_calls: [{ function: { name: 'search_web', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain('Precision=0.000');
      expect(result.reason).toContain('Recall=0.000');
    });

    it('should calculate partial F1 when some tools match (over-calling)', () => {
      // Agent calls 3 tools, but only 2 were expected
      // Precision = 2/3, Recall = 2/2 = 1
      // F1 = 2 * (2/3 * 1) / (2/3 + 1) = 2 * (2/3) / (5/3) = 4/5 = 0.8
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'book_flight', arguments: '{}' } },
          { function: { name: 'extra_tool', arguments: '{}' } },
        ],
      };
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.score).toBeCloseTo(0.8, 3);
      expect(result.reason).toContain('Precision=0.667');
      expect(result.reason).toContain('Recall=1.000');
    });

    it('should calculate partial F1 when some tools match (under-calling)', () => {
      // Agent calls 1 tool, but 2 were expected
      // Precision = 1/1 = 1, Recall = 1/2 = 0.5
      // F1 = 2 * (1 * 0.5) / (1 + 0.5) = 2 * 0.5 / 1.5 = 2/3 ≈ 0.667
      const output = {
        tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.score).toBeCloseTo(0.667, 3);
      expect(result.reason).toContain('Precision=1.000');
      expect(result.reason).toContain('Recall=0.500');
    });

    it('should return F1=0 when no tools are called but some were expected', () => {
      const output = { tool_calls: [] };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should return F1=0 for null output', () => {
      const params = createParams(null, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('output format handling', () => {
    it('should handle OpenAI tool_calls format', () => {
      const output = {
        tool_calls: [
          { type: 'function', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
        ],
      };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle direct array of tool calls', () => {
      const output = [
        { function: { name: 'get_weather', arguments: '{}' } },
        { function: { name: 'book_flight', arguments: '{}' } },
      ];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle simple format with name property directly', () => {
      const output = [{ name: 'get_weather' }, { name: 'book_flight' }];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle mixed format (function.name and name)', () => {
      const output = [
        { function: { name: 'get_weather', arguments: '{}' } },
        { name: 'book_flight' },
      ];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Anthropic single tool_use format', () => {
      const output = {
        type: 'tool_use',
        id: 'toolu_01ABC123',
        name: 'get_weather',
        input: { city: 'NYC' },
      };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Anthropic content blocks array', () => {
      // Anthropic returns an array of content blocks
      const output = [
        { type: 'text', text: 'Let me check the weather for you.' },
        { type: 'tool_use', id: 'toolu_01ABC123', name: 'get_weather', input: { city: 'NYC' } },
        { type: 'tool_use', id: 'toolu_01DEF456', name: 'book_flight', input: { dest: 'LA' } },
      ];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Google/Vertex single functionCall format', () => {
      const output = {
        functionCall: {
          name: 'get_weather',
          args: { city: 'NYC' },
        },
      };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Google/Vertex array of functionCalls', () => {
      const output = [
        { functionCall: { name: 'get_weather', args: { city: 'NYC' } } },
        { functionCall: { name: 'book_flight', args: { dest: 'LA' } } },
      ];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Google Live toolCall format', () => {
      const output = {
        toolCall: {
          functionCalls: [{ name: 'get_weather', args: { city: 'NYC' } }, { name: 'book_flight' }],
        },
      };
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle JSON stringified OpenAI output', () => {
      const output = JSON.stringify({
        tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }],
      });
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle JSON stringified Anthropic output', () => {
      const output = JSON.stringify([
        { type: 'tool_use', id: 'toolu_01ABC123', name: 'get_weather', input: { city: 'NYC' } },
      ]);
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle JSON stringified Google output', () => {
      const output = JSON.stringify({
        functionCall: { name: 'get_weather', args: {} },
      });
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should return empty set for non-JSON string output', () => {
      const output = 'This is just a text response with no tool calls';
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should handle Anthropic mixed text and JSON string output', () => {
      // Anthropic returns text and tool_use blocks joined by \n\n
      const output = `Let me check the weather for you.

{"type":"tool_use","id":"toolu_01ABC123","name":"get_weather","input":{"city":"NYC"}}

{"type":"tool_use","id":"toolu_01DEF456","name":"book_flight","input":{"dest":"LA"}}`;
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle Anthropic output with only one tool call in string', () => {
      const output = `I'll help you with that.

{"type":"tool_use","id":"toolu_123","name":"search_web","input":{"query":"test"}}`;
      const params = createParams(output, ['search_web']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle partial matches across providers', () => {
      // Anthropic-style output with 3 tools, but only 2 expected
      const output = [
        { type: 'tool_use', name: 'get_weather', input: {} },
        { type: 'tool_use', name: 'book_flight', input: {} },
        { type: 'tool_use', name: 'search_web', input: {} },
      ];
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      // Precision = 2/3, Recall = 2/2 = 1, F1 = 0.8
      expect(result.score).toBeCloseTo(0.8, 3);
    });
  });

  describe('expected tools input format', () => {
    it('should accept array of tool names', () => {
      const output = { tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }] };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
    });

    it('should accept comma-separated string of tool names', () => {
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'book_flight', arguments: '{}' } },
        ],
      };
      const params = createParams(output, 'get_weather, book_flight');

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should trim whitespace from comma-separated tool names', () => {
      const output = { tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }] };
      const params = createParams(output, '  get_weather  ,  book_flight  ');

      const result = handleToolCallF1(params);

      // Only get_weather matches, book_flight is missing
      expect(result.score).toBeCloseTo(0.667, 3);
    });
  });

  describe('threshold handling', () => {
    it('should use default threshold of 1.0', () => {
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'extra_tool', arguments: '{}' } },
        ],
      };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      // F1 = 0.667 (precision=0.5, recall=1.0), below default threshold of 1.0
      expect(result.pass).toBe(false);
    });

    it('should respect custom threshold', () => {
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'extra_tool', arguments: '{}' } },
        ],
      };
      const params = createParams(output, ['get_weather'], { threshold: 0.5 });

      const result = handleToolCallF1(params);

      // F1 = 0.667 (precision=0.5, recall=1.0), above threshold of 0.5
      expect(result.pass).toBe(true);
    });
  });

  describe('inverse assertion (not-tool-call-f1)', () => {
    it('should invert pass result when inverse is true', () => {
      const output = {
        tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather'], { inverse: true });

      const result = handleToolCallF1(params);

      // F1=1.0 would normally pass, but inverse makes it fail
      expect(result.pass).toBe(false);
      expect(result.score).toBe(1);
    });

    it('should pass inverse assertion when F1 is below threshold', () => {
      const output = {
        tool_calls: [{ function: { name: 'wrong_tool', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather'], { inverse: true });

      const result = handleToolCallF1(params);

      // F1=0 would normally fail, but inverse makes it pass
      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should throw error when no expected tools provided', () => {
      const output = { tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }] };
      const params = createParams(output, []);

      expect(() => handleToolCallF1(params)).toThrow(
        '"tool-call-f1" assertion requires at least one expected tool name',
      );
    });

    it('should throw error when value is undefined', () => {
      const output = { tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }] };
      const params: AssertionParams = {
        ...createParams(output, ['placeholder']),
        renderedValue: undefined,
      };

      expect(() => handleToolCallF1(params)).toThrow('"tool-call-f1" assertion requires a value');
    });
  });

  describe('set-based comparison (no duplicates)', () => {
    it('should treat duplicate tool calls as single tool', () => {
      // Agent calls get_weather twice, but it only counts as one unique tool
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
          { function: { name: 'get_weather', arguments: '{"city":"LA"}' } },
        ],
      };
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should treat duplicate expected tools as single tool', () => {
      const output = {
        tool_calls: [{ function: { name: 'get_weather', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather', 'get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });
  });
});
