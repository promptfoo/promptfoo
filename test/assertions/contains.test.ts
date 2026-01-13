import { describe, expect, it } from 'vitest';
import {
  handleContains,
  handleContainsAll,
  handleContainsAny,
  handleIContains,
  handleIContainsAll,
  handleIContainsAny,
} from '../../src/assertions/contains';

import type { ApiProvider, AssertionParams, AtomicTestCase } from '../../src/types/index';

const mockProvider: ApiProvider = {
  id: () => 'mock',
  callApi: async () => ({ output: 'mock' }),
};

const defaultParams = {
  baseType: 'contains' as const,
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

describe('handleContains', () => {
  it('should pass when output contains the expected string', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains', value: 'world' },
      renderedValue: 'world',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should fail when output does not contain the expected string', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains', value: 'universe' },
      renderedValue: 'universe',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContains(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain "universe"',
      assertion: params.assertion,
    });
  });

  it('should handle number values', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains', value: '42' },
      renderedValue: '42',
      outputString: 'The answer is 42',
      inverse: false,
    };

    const result = handleContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle inverse assertion correctly', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'not-contains', value: 'universe' },
      renderedValue: 'universe',
      outputString: 'hello world',
      inverse: true,
    };

    const result = handleContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should use valueFromScript over renderedValue when available', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains', value: 'unused' },
      renderedValue: 'unused',
      valueFromScript: 'world',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should throw error when value is missing', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains' },
      renderedValue: undefined,
      outputString: 'hello world',
      inverse: false,
    };

    expect(() => handleContains(params)).toThrow(
      '"contains" assertion type must have a string or number value',
    );
  });
});

describe('handleIContains', () => {
  it('should pass when output contains the expected string case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains', value: 'WORLD' },
      renderedValue: 'WORLD',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleIContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle mixed case in output and value', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains', value: 'WoRlD' },
      renderedValue: 'WoRlD',
      outputString: 'Hello WORLD',
      inverse: false,
    };

    const result = handleIContains(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });
});

describe('handleContainsAny', () => {
  it('should pass when output contains any of the expected strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: ['world', 'universe'] },
      renderedValue: ['world', 'universe'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle comma-separated string input', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: 'world,universe' },
      renderedValue: 'world,universe',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle quoted values with commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello, world",universe' },
      renderedValue: '"hello, world",universe',
      outputString: 'hello, world',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle complex quoted values with commas and spaces', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'contains-any',
        value: '"hello, dear world", "goodbye, universe", simple',
      },
      renderedValue: '"hello, dear world", "goodbye, universe", simple',
      outputString: 'hello, dear world is here',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle empty quoted strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"",' },
      renderedValue: '"",',
      outputString: '',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle escaped quotes and commas in quoted strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello\\"world,test", "another,test"' },
      renderedValue: '"hello\\"world,test", "another,test"',
      outputString: 'hello"world,test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle null value after regex match', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '""' },
      renderedValue: '""',
      outputString: 'test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle regex match with no groups', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test"' },
      renderedValue: '"test"',
      outputString: 'test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle regex match with escaped characters', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test\\test"' },
      renderedValue: '"test\\test"',
      outputString: 'test\\test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle regex match with complex escaping', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test\\\\test"' },
      renderedValue: '"test\\\\test"',
      outputString: 'test\\\\test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle regex match with unmatched quotes', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test' },
      renderedValue: '"test',
      outputString: 'test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });
});

describe('handleIContainsAny', () => {
  it('should pass when output contains any of the expected strings case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: ['WORLD', 'UNIVERSE'] },
      renderedValue: ['WORLD', 'UNIVERSE'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle comma-separated string input case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: 'WORLD,UNIVERSE' },
      renderedValue: 'WORLD,UNIVERSE',
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string input with multiple commas and spaces', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: 'HELLO,  WORLD  ,  UNIVERSE' },
      renderedValue: 'HELLO,  WORLD  ,  UNIVERSE',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle empty string in comma-separated list', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: ',WORLD,,' },
      renderedValue: ',WORLD,,',
      outputString: '',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with spaces', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '  HELLO  ' },
      renderedValue: '  HELLO  ',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with multiple spaces between commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: 'HELLO  ,  WORLD' },
      renderedValue: 'HELLO  ,  WORLD',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with multiple spaces and special characters', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '  HELLO  ,  WORLD  ' },
      renderedValue: '  HELLO  ,  WORLD  ',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with multiple spaces and commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '  HELLO  ,  ,  WORLD  ' },
      renderedValue: '  HELLO  ,  ,  WORLD  ',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with multiple consecutive commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: 'HELLO,,,,WORLD' },
      renderedValue: 'HELLO,,,,WORLD',
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should handle string value with only spaces and commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '  ,  ,  ' },
      renderedValue: '  ,  ,  ',
      outputString: '',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });
});

describe('handleContainsAll', () => {
  it('should pass when output contains all expected strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: ['hello', 'world'] },
      renderedValue: ['hello', 'world'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should fail when output is missing some expected strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: ['hello', 'world', 'universe'] },
      renderedValue: ['hello', 'world', 'universe'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain all of [hello, world, universe]. Missing: [universe]',
      assertion: params.assertion,
    });
  });
});

describe('handleIContainsAll', () => {
  it('should pass when output contains all expected strings case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: ['HELLO', 'WORLD'] },
      renderedValue: ['HELLO', 'WORLD'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });

  it('should fail when output is missing some expected strings case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: ['HELLO', 'WORLD', 'UNIVERSE'] },
      renderedValue: ['HELLO', 'WORLD', 'UNIVERSE'],
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain all of [HELLO, WORLD, UNIVERSE]. Missing: [UNIVERSE]',
      assertion: params.assertion,
    });
  });

  it('should handle mixed case in both output and expected values', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: ['HeLLo', 'WoRLD'] },
      renderedValue: ['HeLLo', 'WoRLD'],
      outputString: 'HELLO world',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result).toEqual({
      pass: true,
      score: 1,
      reason: 'Assertion passed',
      assertion: params.assertion,
    });
  });
});
