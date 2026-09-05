import { describe, expect, it } from 'vitest';
import { handleToolCallF1 } from '../../src/assertions/toolCallF1';
import { FunctionCallbackHandler } from '../../src/providers/functionCallbackUtils';
import { ResponsesProcessor } from '../../src/providers/responses/processor';

import type { AssertionParams } from '../../src/types/index';

const call = (name: string) => ({
  type: 'function_call',
  id: `fc_${name}`,
  call_id: `call_${name}`,
  name,
  arguments: '{"city":"NYC"}',
  status: 'completed',
});
const grade = (output: unknown, expected = ['get_weather']) =>
  handleToolCallF1({
    assertion: { type: 'tool-call-f1', value: expected },
    output,
    renderedValue: expected,
    inverse: false,
  } as AssertionParams);

describe('Responses function calls retain tool-call-f1 scores', () => {
  it.each([
    ['single object', call('get_weather')],
    ['JSON string', JSON.stringify(call('get_weather'))],
    ['text plus JSON', `Looking up weather.\n${JSON.stringify(call('get_weather'))}`],
  ])('%s should score one for the expected tool', (_name, output) => {
    expect(grade(output)).toMatchObject({ score: 1, pass: true });
  });

  it('array control already recognizes the same call', () => {
    expect(grade([call('get_weather')]).score).toBe(1);
  });
  it('Chat Completions control recognizes the expected tool', () => {
    expect(
      grade([{ type: 'function', function: { name: 'get_weather', arguments: '{}' } }]).score,
    ).toBe(1);
  });
  it.each([
    { name: 'get_weather', type: 'message' },
    { name: 'get_weather' },
    { type: 'function_call' },
    { type: 'function_call', name: 42 },
  ])('does not extract a tool name from %j', (output) => {
    expect(grade(output).score).toBe(0);
  });
  it('wrong tool must score zero', () => {
    expect(grade([call('book_flight')]).score).toBe(0);
  });

  it.each(['openai', 'azure', 'xai'] as const)(
    '%s real ResponsesProcessor output should retain both calls',
    async (providerType) => {
      const processor = new ResponsesProcessor({
        modelName: 'fixture-model',
        providerType,
        functionCallbackHandler: new FunctionCallbackHandler(),
        costCalculator: () => 0,
      });
      const response = await processor.processResponseOutput(
        {
          id: 'resp_fixture',
          output: [call('get_weather'), call('book_flight')],
        },
        {},
        false,
      );
      expect(response.error).toBeUndefined();
      expect(response.output).toBe(
        [call('get_weather'), call('book_flight')].map((item) => JSON.stringify(item)).join('\n'),
      );
      const result = grade(response.output, ['get_weather', 'book_flight']);
      expect(result.score).toBe(1);
      expect(result.pass).toBe(true);
    },
  );
});
