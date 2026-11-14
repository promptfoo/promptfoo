import { describe, expect, it } from 'vitest';
import { handleStartsWith } from '../../src/assertions/startsWith';
import { createMockProvider } from '../factories/provider';

import type { AssertionParams } from '../../src/types/index';

function params(value: string | number, output: string, inverse = false): AssertionParams {
  const providerResponse = { output };
  return {
    baseType: 'starts-with',
    assertion: { type: inverse ? 'not-starts-with' : 'starts-with', value },
    assertionValueContext: {
      vars: {},
      logProbs: undefined,
      test: {},
      prompt: '',
      provider: createMockProvider(),
      providerResponse,
    },
    inverse,
    renderedValue: value,
    output,
    outputString: output,
    providerResponse,
    test: {},
  };
}

describe('handleStartsWith', () => {
  it.each([
    ['hello', 'hello world', false, true],
    ['hello', 'world', false, false],
    [42, '42 apples', false, true],
    [42, 'apples 42', false, false],
    [0, '0 results', false, true],
    ['Infinity', 'Infinity', false, true],
    ['-Infinity', '-Infinity', false, true],
    [42, '42 apples', true, false],
    [42, 'apples 42', true, true],
  ] as const)('matches %s against %s (inverse %s)', (value, output, inverse, pass) => {
    const input = params(value, output, inverse);
    expect(handleStartsWith(input)).toEqual({
      pass,
      score: Number(pass),
      assertion: input.assertion,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}start with "${value}"`,
    });
  });

  it.each([[NaN], [Infinity], [-Infinity], [''], [true], [{}], [['42']], [undefined], [null]])(
    'rejects %s',
    (value) => {
      expect(() =>
        handleStartsWith({
          ...params('valid', '42'),
          renderedValue: value as AssertionParams['renderedValue'],
        }),
      ).toThrow('"starts-with" assertion type must have a non-empty string or finite number value');
    },
  );
});
