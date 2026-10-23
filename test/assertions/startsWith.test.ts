import { describe, expect, it } from 'vitest';
import { handleStartsWith } from '../../src/assertions/startsWith';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

const defaultParams = {
  baseType: 'starts-with' as const,
  inverse: false,
  assertionValueContext: {
    vars: {},
    test: {} as AtomicTestCase,
    prompt: 'test prompt',
    logProbs: undefined,
    provider: mockProvider,
    providerResponse: { output: 'hello world' },
  },
  output: 'hello world',
  providerResponse: { output: 'hello world' },
  test: {} as AtomicTestCase,
};

describe('handleStartsWith', () => {
  it('should pass when output starts with the expected string', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'starts-with', value: 'hello' },
      renderedValue: 'hello',
      outputString: 'hello world',
    };

    expect(handleStartsWith(params)).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should fail when output does not start with the expected string', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'starts-with', value: 'world' },
      renderedValue: 'world',
      outputString: 'hello world',
    };

    expect(handleStartsWith(params)).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to start with "world"',
      assertion: params.assertion,
    });
  });

  it('should handle inverse assertion correctly', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-starts-with', value: 'world' },
      renderedValue: 'world',
      outputString: 'hello world',
      inverse: true,
    };

    expect(handleStartsWith(params)).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it.each([
    { renderedValue: 42, outputString: '42 apples', pass: true },
    { renderedValue: 42, outputString: 'apples 42', pass: false },
    { renderedValue: 0, outputString: '0 results', pass: true },
    { renderedValue: 2026, outputString: '2026 is a year', pass: true },
  ])(
    'should grade numeric value $renderedValue against "$outputString"',
    ({ renderedValue, outputString, pass }) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'starts-with', value: renderedValue },
        renderedValue,
        outputString,
      };

      const result = handleStartsWith(params);
      expect(result.pass).toBe(pass);
      expect(result.reason).toBe(
        pass ? 'Assertion passed' : `Expected output to start with "${renderedValue}"`,
      );
    },
  );

  it('should handle not-starts-with with a numeric value', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-starts-with', value: 42 },
      renderedValue: 42,
      outputString: 'apples 42',
      inverse: true,
    };

    expect(handleStartsWith(params)).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it.each([[Number.NaN], [''], [{}], [{ foo: 'bar' }], [['42']], [undefined], [null]])(
    'should reject invalid value %s with a clear error',
    (renderedValue) => {
      const params: AssertionParams = {
        ...defaultParams,
        assertion: { type: 'starts-with', value: renderedValue as never },
        renderedValue: renderedValue as never,
        outputString: '42 apples',
      };

      expect(() => handleStartsWith(params)).toThrow(
        '"starts-with" assertion type must have a string or number value',
      );
    },
  );

  it.each([Infinity, -Infinity])('supports %s', (value) => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'starts-with', value },
      renderedValue: value,
      outputString: String(value),
    };

    expect(handleStartsWith(params).pass).toBe(true);
  });
});
