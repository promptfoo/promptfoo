import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleToolCallF1 } from '../../src/assertions/toolCallF1';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

    it('should handle JSON stringified OpenAI Responses function_call output', () => {
      const output = JSON.stringify({
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'get_weather',
        arguments: '{"city":"NYC"}',
      });
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle newline-separated OpenAI Responses function_call output', () => {
      const output = `Thinking about the request.
{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_weather","arguments":"{\\"city\\":\\"NYC\\"}"}
{"type":"function_call","id":"fc_2","call_id":"call_2","name":"book_flight","arguments":"{\\"destination\\":\\"LA\\"}"}`;
      const params = createParams(output, ['get_weather', 'book_flight']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should not treat unrelated named objects as tool calls', () => {
      const output = JSON.stringify({ type: 'response_metadata', name: 'get_weather' });
      const params = createParams(output, ['get_weather']);

      const result = handleToolCallF1(params);

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
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

    it('extracts complete pretty-printed JSON blocks after text', () => {
      const output = [
        'Let me check that. Braces in prose {not JSON} are ignored.',
        JSON.stringify(
          { type: 'tool_use', name: 'get_weather', input: { query: 'a } b' } },
          null,
          2,
        ),
        'And then book the flight.',
        JSON.stringify(
          [{ type: 'tool_use', name: 'book_flight', input: { destination: 'LA' } }],
          null,
          2,
        ),
      ].join('\n\n');

      const result = handleToolCallF1(createParams(output, ['get_weather', 'book_flight']));

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('does not count an incomplete JSON tool block', () => {
      const output = 'Here is a partial call: {"type":"tool_use","name":"get_weather"';
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result.score).toBe(0);
    });

    it.each([
      'The tool payload would be {"type":"tool_use","name":"delete_account"}',
      '{"type":"tool_use","name":"delete_account"} is an example payload.',
      '{\n"input":\n{"type":"tool_use","name":"delete_account"}\n} is an example payload.',
    ])('does not count a JSON example in prose as a tool call: %s', (output) => {
      const result = handleToolCallF1(createParams(output, ['delete_account']));

      expect(result.score).toBe(0);
    });

    it.each(['{', '[', '{"broken":', '{]', '{"broken":"unfinished\\'])(
      'recovers a complete call after an unfinished or invalid candidate: %s',
      (prefix) => {
        const output = `${prefix}\n${JSON.stringify(
          { type: 'tool_use', name: 'get_weather', input: { city: 'NYC' } },
          null,
          2,
        )}`;
        const result = handleToolCallF1(createParams(output, ['get_weather']));

        expect(result).toMatchObject({ pass: true, score: 1 });
      },
    );

    it('keeps unindented nested tool-shaped arguments inside their enclosing call', () => {
      const output = `Calling the weather tool.\n${JSON.stringify(
        {
          type: 'tool_use',
          name: 'get_weather',
          input: [{ type: 'tool_use', name: 'delete_account', query: 'a \\" } [ b' }],
        },
        null,
        2,
      ).replace(/^ +/gm, '')}`;
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result).toMatchObject({ pass: true, score: 1 });
    });

    it('recovers a nested call when its balanced enclosing candidate is invalid', () => {
      const output = '{\nnot_json\n{"type":"tool_use","name":"get_weather"}\n}';
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result).toMatchObject({ pass: true, score: 1 });
    });

    it.each([
      ['```json', '```'],
      ['~~~json', '~~~'],
      ['```json', ' ```'],
      ['   ```json', '   ````'],
      ['   ```json', '```'],
      ['````json', '```\n~~~\n````'],
      ['```json', '~~~\n```'],
      ['```json', '```json\n```'],
    ])('ignores examples inside %s fences and preserves later calls', (opening, closing) => {
      const output = [
        'Example:',
        opening,
        '{"type":"tool_use","name":"delete_account"}',
        closing,
        '{"type":"tool_use","name":"get_weather"}',
      ].join('\r\n');
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result).toMatchObject({ pass: true, score: 1 });
    });

    it.each(['```json {"example":true} ```', '```info`invalid', '- ```info`invalid'])(
      'keeps calls after an invalid backtick fence opener: %s',
      (example) => {
        const output = [
          '{"type":"tool_use","name":"get_weather"}',
          example,
          '{"type":"tool_use","name":"delete_account"}',
        ].join('\n');
        const result = handleToolCallF1(createParams(output, ['get_weather']));

        expect(result.pass).toBe(false);
        expect(result.score).toBeCloseTo(2 / 3);
        expect(result.reason).toContain('Called: [delete_account, get_weather]');
      },
    );

    it.each([
      ['Example: {\n"payload":', '}'],
      ['Example: [', ']'],
    ])('ignores calls nested inside an inline example wrapper: %s', (opening, closing) => {
      const output = [
        '{"type":"tool_use","name":"get_weather"}',
        opening,
        '{"type":"tool_use","name":"delete_account"}',
        closing,
      ].join('\n');

      expect(handleToolCallF1(createParams(output, ['get_weather']))).toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it('ignores an example in an unclosed fence', () => {
      const output = 'Example:\n```json\n{"type":"tool_use","name":"delete_account"}';
      const result = handleToolCallF1(createParams(output, ['delete_account']));

      expect(result).toMatchObject({ pass: false, score: 0 });
    });

    it('does not close a top-level fence with indented content', () => {
      const output = [
        '```json',
        '    ```',
        '{"type":"tool_use","name":"delete_account"}',
        '```',
      ].join('\n');
      const result = handleToolCallF1(createParams(output, ['delete_account']));

      expect(result).toMatchObject({ pass: false, score: 0 });
    });

    it.each(['    ', '      ', '\t'])(
      'ignores fenced examples nested in a Markdown list with %j indentation',
      (indent) => {
        const output = [
          '  - Example:',
          `${indent}\`\`\`json`,
          `${indent}{"type":"tool_use","name":"delete_account"}`,
          `${indent}\`\`\``,
          '{"type":"tool_use","name":"get_weather"}',
        ].join('\n');
        const result = handleToolCallF1(createParams(output, ['get_weather']));

        expect(result).toMatchObject({ pass: true, score: 1 });
      },
    );

    it.each([
      ['```json', '    ```', '', '```'],
      ['  - Example:\n    ```json', '        ```', '    ', '    ```'],
    ])('keeps over-indented markers inside %s fences', (opening, marker, indent, closing) => {
      const output = [
        opening,
        marker,
        `${indent}{"type":"tool_use","name":"delete_account"}`,
        closing,
        '{"type":"tool_use","name":"get_weather"}',
      ].join('\n');

      expect(handleToolCallF1(createParams(output, ['get_weather']))).toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it.each(['- ', '12. '])('recognizes a fence after a %s list marker', (list) => {
      const indent = ' '.repeat(list.length);
      const output = [
        `${list}\`\`\`json`,
        `${indent}{"type":"tool_use","name":"delete_account"}`,
        `${indent}\`\`\``,
        '{"type":"tool_use","name":"get_weather"}',
      ].join('\n');

      expect(handleToolCallF1(createParams(output, ['get_weather']))).toMatchObject({
        pass: true,
        score: 1,
      });
    });

    it.each([
      ['Actual call: {', '}'],
      ['Actual call: [\ninvalid', ']'],
    ])('recovers calls from an inline malformed wrapper: %s', (opening, closing) => {
      const output = [
        opening,
        '{"type":"tool_use","name":"delete_account"}',
        closing,
        '{"type":"tool_use","name":"get_weather"}',
      ].join('\n');
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result.pass).toBe(false);
      expect(result.score).toBeCloseTo(2 / 3);
      expect(result.reason).toContain('Called: [delete_account, get_weather]');
    });

    it('recovers unexpected calls from long malformed wrappers', () => {
      const output = [
        '{',
        'x'.repeat(2_000),
        '{"type":"tool_use","name":"delete_account"}',
        '}',
        '{"type":"tool_use","name":"get_weather"}',
      ].join('\n');

      const result = handleToolCallF1(createParams(output, ['get_weather']));
      expect(result.pass).toBe(false);
      expect(result.score).toBeCloseTo(2 / 3);
      expect(result.reason).toContain('Called: [delete_account, get_weather]');
    });

    it('bounds parsing work for large nested invalid JSON candidates', () => {
      const output = `${'{\n'.repeat(1_000)}${'}\n'.repeat(1_000)}`;
      const parse = vi.spyOn(JSON, 'parse');
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result.score).toBe(0);
      // One whole-output attempt plus a linear budget for embedded candidates.
      const parsedCharacters = parse.mock.calls.reduce((total, [value]) => total + value.length, 0);
      expect(parsedCharacters).toBeLessThanOrEqual(5 * output.length);
      expect(result).toMatchObject({ pass: false, reason: expect.stringContaining('work limit') });
    });

    it.each([false, true])('fails explicitly on exhausted work with inverse=%s', (inverse) => {
      const output =
        '{"type":"tool_use","name":"get_weather"}\n' + '{\n'.repeat(1_000) + '}\n'.repeat(1_000);
      const params = {
        ...createParams(output, ['get_weather']),
        inverse,
        assertion: { type: 'tool-call-f1' as const, threshold: 0 },
      };

      expect(handleToolCallF1(params)).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('work limit'),
      });
      expect(handleToolCallF1({ ...params, output: JSON.stringify(output) })).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('work limit'),
      });
    });

    it.each(['{', '[', '}', ']'])(
      'fails explicitly when unmatched %s delimiters exceed the recovery limit',
      (delimiter) => {
        const output = '{"type":"tool_use","name":"get_weather"}\n' + delimiter.repeat(200_000);
        for (const inverse of [false, true]) {
          const params = {
            ...createParams(output, ['get_weather'], { threshold: 0 }),
            inverse,
          };
          expect(handleToolCallF1(params)).toMatchObject({
            pass: false,
            score: 0,
            reason: expect.stringContaining('delimiter limit'),
          });
          expect(handleToolCallF1({ ...params, output: JSON.stringify(output) })).toMatchObject({
            pass: false,
            score: 0,
            reason: expect.stringContaining('delimiter limit'),
          });
        }
      },
    );

    it('recovers a call after many unmatched opening braces', () => {
      const output = `${'{\n'.repeat(10_000)}{"type":"tool_use","name":"get_weather"}`;
      const result = handleToolCallF1(createParams(output, ['get_weather']));

      expect(result).toMatchObject({ pass: true, score: 1 });
    });

    it('streams many JSON blocks within a small heap', () => {
      const result = spawnSync(
        process.execPath,
        [
          '--max-old-space-size=128',
          '--import',
          'tsx',
          '--input-type=module',
          '--eval',
          String.raw`
            import { handleToolCallF1 } from './src/assertions/toolCallF1.ts';
            for (const prefix of ['', '{\n']) {
              const output = prefix + '{"type":"tool_use","name":"book_flight"}\n' +
                '{}\n'.repeat(1_250_000) +
                '{"type":"tool_use","name":"get_weather"}';
              const result = handleToolCallF1({
                assertion: { type: 'tool-call-f1' },
                output,
                renderedValue: ['book_flight', 'get_weather'],
                inverse: false,
              });
              if (!result.pass || result.score !== 1) {
                throw new Error('Lost an early or late tool call');
              }
            }
          `,
        ],
        {
          cwd: fileURLToPath(new URL('../..', import.meta.url)),
          encoding: 'utf8',
          timeout: 20_000,
        },
      );

      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
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

      // F1=1.0 would normally pass, but inverse makes it fail — and the
      // inverted score (0) must not feed the original full score into
      // weighted/threshold aggregation.
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should pass inverse assertion when F1 is below threshold', () => {
      const output = {
        tool_calls: [{ function: { name: 'wrong_tool', arguments: '{}' } }],
      };
      const params = createParams(output, ['get_weather'], { inverse: true });

      const result = handleToolCallF1(params);

      // F1=0 would normally fail, but inverse makes it pass with full score
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should invert mid-range scores, not just the 0/1 extremes', () => {
      // expected {get_weather, search}, called {get_weather, calculator, search}:
      // precision=2/3, recall=1 -> F1=0.8
      const output = {
        tool_calls: [
          { function: { name: 'get_weather', arguments: '{}' } },
          { function: { name: 'calculator', arguments: '{}' } },
          { function: { name: 'search', arguments: '{}' } },
        ],
      };
      const params = createParams(output, ['get_weather', 'search'], {
        inverse: true,
        threshold: 0.5,
      });

      const result = handleToolCallF1(params);

      // F1=0.8 >= 0.5 would normally pass, so the inverse fails — with the
      // inverted score 0.2 rather than the raw 0.8.
      expect(result.pass).toBe(false);
      expect(result.score).toBeCloseTo(0.2);
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

    it.each(['', '  ', ' , , ', [' ', '']])(
      'rejects empty expected tool names from %j',
      (expectedTools) => {
        expect(() => handleToolCallF1(createParams({}, expectedTools))).toThrow(
          '"tool-call-f1" assertion requires at least one expected tool name',
        );
      },
    );

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

  describe('OpenAI Responses API function_call items', () => {
    const singleCall = {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'get_weather',
      arguments: '{"city":"NYC"}',
    };

    it('recognizes a single function_call object', () => {
      const result = handleToolCallF1(createParams(singleCall, ['get_weather']));
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('recognizes a JSON-stringified single function_call (Responses providers serialize calls)', () => {
      const result = handleToolCallF1(createParams(JSON.stringify(singleCall), ['get_weather']));
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('still scores zero when the function_call name does not match', () => {
      const result = handleToolCallF1(createParams(singleCall, ['book_flight']));
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});
