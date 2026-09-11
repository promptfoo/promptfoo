import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { FunctionCallbackHandler } from '../../src/providers/functionCallbackUtils';
import { ResponsesProcessor } from '../../src/providers/responses/processor';

import type { ProviderResponse } from '../../src/types/index';

const call = (name: string) => ({
  type: 'function_call',
  id: `fc_${name}`,
  call_id: `call_${name}`,
  name,
  arguments: '{"city":"NYC"}',
  status: 'completed',
});
const grade = (providerResponse: ProviderResponse, expected = ['get_weather']) =>
  runAssertion({
    assertion: { type: 'tool-call-f1', value: expected },
    providerResponse,
    test: {},
  });

describe('Responses tool-call-f1 input validation', () => {
  it.each([
    { name: 'get_weather', type: 'message' },
    { name: 'get_weather' },
    { type: 'function_call' },
    { type: 'function_call', name: 42 },
    '{"type":"function_call","name":',
  ])('does not extract a tool name from %j', async (output) => {
    expect(await grade({ output })).toMatchObject({ score: 0, pass: false });
  });
});

describe.each([
  'openai',
  'azure',
  'xai',
] as const)('%s Responses tool-call-f1 without function callbacks', (providerType) => {
  const processOutput = (output: object[]) => {
    const processor = new ResponsesProcessor({
      modelName: 'fixture-model',
      providerType,
      functionCallbackHandler: new FunctionCallbackHandler(),
      costCalculator: () => 0,
    });
    return processor.processResponseOutput({ id: 'resp_fixture', output }, {}, false);
  };

  it.each([
    ['one call', [call('get_weather')], ['get_weather']],
    ['multiple calls', [call('get_weather'), call('book_flight')], ['get_weather', 'book_flight']],
    ['repeated calls', [call('get_weather'), call('get_weather')], ['get_weather']],
  ])('grades %s emitted by the real processor and callback handler', async (_name, calls, expected) => {
    const response = await processOutput(calls);
    expect(response.error).toBeUndefined();
    expect(response.output).toBe(calls.map((item) => JSON.stringify(item)).join('\n'));
    expect(await grade(response, expected)).toMatchObject({ score: 1, pass: true });
  });

  it('grades calls mixed with assistant text', async () => {
    const calls = [call('get_weather'), call('book_flight')];
    const response = await processOutput([
      calls[0],
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Checking flights next.' }],
      },
      calls[1],
    ]);

    expect(response.error).toBeUndefined();
    expect(response.output).toBe(
      `${JSON.stringify(calls[0])}\nChecking flights next.\n${JSON.stringify(calls[1])}`,
    );
    expect(await grade(response, ['get_weather', 'book_flight'])).toMatchObject({
      score: 1,
      pass: true,
    });
  });

  it.each([
    ['wrong tools', ['search_web'], 0],
    ['unexpected tools', ['get_weather'], 2 / 3],
    ['missing tools', ['get_weather', 'book_flight', 'search_web'], 4 / 5],
  ])('fails for %s after processing', async (_name, expected, score) => {
    const response = await processOutput([call('get_weather'), call('book_flight')]);
    expect(response.error).toBeUndefined();

    const result = await grade(response, expected);
    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(score);
  });
});
