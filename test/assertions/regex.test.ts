import { describe, expect, it } from 'vitest';
import { handleRegex } from '../../src/assertions/regex';
import { createMockProvider } from '../factories/provider';

import type { AssertionParams } from '../../src/types/index';

function params(value: string | number, output: string, inverse = false): AssertionParams {
  const providerResponse = { output };
  return {
    baseType: 'regex',
    assertion: { type: inverse ? 'not-regex' : 'regex', value },
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

describe('handleRegex', () => {
  it.each([
    ['\\d{3}', 'call 123 now', false, true],
    ['\\d{3}', 'no digits here', false, false],
    [123, 'error code 123 found', false, true],
    [123, 'no code here', false, false],
    [0, '0 results', false, true],
    [42, '42 apples', true, false],
    [42, 'no code here', true, true],
  ] as const)('matches %s against %s (inverse %s)', (value, output, inverse, pass) => {
    const input = params(value, output, inverse);
    expect(handleRegex(input)).toEqual({
      pass,
      score: Number(pass),
      assertion: input.assertion,
      reason: pass
        ? 'Assertion passed'
        : `Expected output to ${inverse ? 'not ' : ''}match regex "${value}"`,
    });
  });

  it('reports an invalid regex pattern instead of throwing', () => {
    const input = params('[invalid', 'some output');
    const result = handleRegex(input);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toMatch(/^Invalid regex pattern: /);
  });

  it.each([[NaN], [Infinity], [-Infinity], [''], [true], [{}], [['123']], [undefined], [null]])(
    'rejects %s',
    (value) => {
      expect(() =>
        handleRegex({
          ...params('valid', '123'),
          renderedValue: value as AssertionParams['renderedValue'],
        }),
      ).toThrow('"regex" assertion type must have a non-empty string or finite number value');
    },
  );
});
