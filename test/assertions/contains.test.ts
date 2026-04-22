import { describe, expect, it } from 'vitest';
import {
  handleContains,
  handleContainsAll,
  handleContainsAny,
  handleIContains,
  handleIContainsAll,
  handleIContainsAny,
} from '../../src/assertions/contains';
import { createMockProvider, createProviderResponse } from '../factories/provider';

import type { AssertionParams, AssertionValue, AtomicTestCase } from '../../src/types/index';

const mockProvider = createMockProvider({
  id: 'mock',
  response: createProviderResponse({ output: 'mock' }),
});

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
      renderedValue: 'world' as AssertionValue,
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
      renderedValue: 'universe' as AssertionValue,
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
      renderedValue: '42' as AssertionValue,
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
      renderedValue: 'universe' as AssertionValue,
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
      renderedValue: 'unused' as AssertionValue,
      valueFromScript: 'world' as AssertionValue,
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
      renderedValue: 'WORLD' as AssertionValue,
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
      renderedValue: 'WoRlD' as AssertionValue,
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
      renderedValue: ['world', 'universe'] as AssertionValue,
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
      renderedValue: 'world,universe' as AssertionValue,
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
      renderedValue: '"hello, world",universe' as AssertionValue,
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
      renderedValue: '"hello, dear world", "goodbye, universe", simple' as AssertionValue,
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
      renderedValue: '"",' as AssertionValue,
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

  it('should not create false-positive empty token from tab after quoted field', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello, world"\t,foo' },
      renderedValue: '"hello, world"\t,foo' as AssertionValue,
      outputString: 'zzz',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(false);
  });

  it('should handle non-space whitespace between fields', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello, world"\t,\t"foo"' },
      renderedValue: '"hello, world"\t,\t"foo"' as AssertionValue,
      outputString: 'foo',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(true);
  });

  it('should handle CSV-style doubled quotes as literal quote', () => {
    // "a""b" in CSV means the value a"b
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"a""b",c' },
      renderedValue: '"a""b",c' as AssertionValue,
      outputString: 'a"b',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(true);
  });

  it('should not false-positive on partial token from doubled quotes', () => {
    // "a""b",c should parse as ["a\"b", "c"], not ["a", "b", "c"]
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"a""b",c' },
      renderedValue: '"a""b",c' as AssertionValue,
      outputString: 'b',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(false);
  });

  it('should handle escaped quotes and commas in quoted strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello\\"world,test", "another,test"' },
      renderedValue: '"hello\\"world,test", "another,test"' as AssertionValue,
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
      renderedValue: '""' as AssertionValue,
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
      renderedValue: '"test"' as AssertionValue,
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
      renderedValue: '"test\\test"' as AssertionValue,
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
    // Value "test\\test" has an escaped backslash, which parses to test\test
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test\\\\test"' },
      renderedValue: '"test\\\\test"' as AssertionValue,
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

  it('should correctly parse both fields with escaped quotes', () => {
    // Verifies the second quoted field is parsed correctly (not split by comma)
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello\\"world,test", "another,test"' },
      renderedValue: '"hello\\"world,test", "another,test"' as AssertionValue,
      outputString: 'another,test',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(true);
  });

  it('should fail when escaped quote value does not match', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello\\"world,test", "another,test"' },
      renderedValue: '"hello\\"world,test", "another,test"' as AssertionValue,
      outputString: 'something completely different',
      inverse: false,
    };

    const result = handleContainsAny(params);
    expect(result.pass).toBe(false);
  });

  it('should reject unmatched quotes', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"test' },
      renderedValue: '"test' as AssertionValue,
      outputString: 'test',
      inverse: false,
    };

    expect(() => handleContainsAny(params)).toThrow(
      'Unterminated quoted field in contains assertion value',
    );
  });

  it('should reject non-delimiter characters after quoted fields', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello"world' },
      renderedValue: '"hello"world' as AssertionValue,
      outputString: 'hello world',
      inverse: false,
    };

    expect(() => handleContainsAny(params)).toThrow(
      'Expected comma after quoted field in contains assertion value',
    );
  });

  it('should reject whitespace-separated quoted and unquoted fields without a comma', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-any', value: '"hello" world' },
      renderedValue: '"hello" world' as AssertionValue,
      outputString: 'hello world',
      inverse: false,
    };

    expect(() => handleContainsAny(params)).toThrow(
      'Expected comma after quoted field in contains assertion value',
    );
  });
});

describe('handleIContainsAny', () => {
  it('should handle escaped quotes with commas case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'icontains-any',
        value: '"hello\\"world,test", "another,test"',
      },
      renderedValue: '"hello\\"world,test", "another,test"' as AssertionValue,
      outputString: 'ANOTHER,TEST',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result.pass).toBe(true);
  });

  it('should handle quoted values with commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '"hello, world",universe' },
      renderedValue: '"hello, world",universe' as AssertionValue,
      outputString: 'HELLO, WORLD',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result.pass).toBe(true);
  });

  it('should pass when output contains any of the expected strings case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: ['WORLD', 'UNIVERSE'] },
      renderedValue: ['WORLD', 'UNIVERSE'] as AssertionValue,
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
      renderedValue: 'WORLD,UNIVERSE' as AssertionValue,
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
      renderedValue: 'HELLO,  WORLD  ,  UNIVERSE' as AssertionValue,
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

  it('should ignore empty entries in comma-separated list', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: ',WORLD,,' },
      renderedValue: ',WORLD,,' as AssertionValue,
      outputString: '',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain one of "WORLD"',
      assertion: params.assertion,
    });
  });

  it('should preserve quoted empty strings in comma-separated list', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-any', value: '"",WORLD' },
      renderedValue: '"",WORLD' as AssertionValue,
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
      renderedValue: '  HELLO  ' as AssertionValue,
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
      renderedValue: 'HELLO  ,  WORLD' as AssertionValue,
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
      renderedValue: '  HELLO  ,  WORLD  ' as AssertionValue,
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
      renderedValue: '  HELLO  ,  ,  WORLD  ' as AssertionValue,
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
      renderedValue: 'HELLO,,,,WORLD' as AssertionValue,
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
      renderedValue: '  ,  ,  ' as AssertionValue,
      outputString: '',
      inverse: false,
    };

    const result = handleIContainsAny(params);
    expect(result).toEqual({
      pass: false,
      score: 0,
      reason: 'Expected output to contain one of ""',
      assertion: params.assertion,
    });
  });
});

describe('handleContainsAll', () => {
  it('should handle quoted values with commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: '"hello, world","foo"' },
      renderedValue: '"hello, world","foo"' as AssertionValue,
      outputString: 'hello, world and foo',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should fail when quoted value is missing', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: '"hello, world","bar"' },
      renderedValue: '"hello, world","bar"' as AssertionValue,
      outputString: 'hello, world and foo',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result.pass).toBe(false);
  });

  it('should handle single value without commas', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: 'hello' },
      renderedValue: 'hello' as AssertionValue,
      outputString: 'hello world',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should handle escaped quotes in contains-all', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'contains-all',
        value: '"say \\"hello\\"", "another,phrase"',
      },
      renderedValue: '"say \\"hello\\"", "another,phrase"' as AssertionValue,
      outputString: 'say "hello" and another,phrase here',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should fail when escaped-quote value is missing from output', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'contains-all',
        value: '"say \\"hello\\"", "missing,value"',
      },
      renderedValue: '"say \\"hello\\"", "missing,value"' as AssertionValue,
      outputString: 'say "hello" only',
      inverse: false,
    };

    const result = handleContainsAll(params);
    expect(result.pass).toBe(false);
  });

  it('should pass when output contains all expected strings', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'contains-all', value: ['hello', 'world'] },
      renderedValue: ['hello', 'world'] as AssertionValue,
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
      renderedValue: ['hello', 'world', 'universe'] as AssertionValue,
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
  it('should handle escaped quotes case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: {
        type: 'icontains-all',
        value: '"say \\"hello\\"", "another,phrase"',
      },
      renderedValue: '"say \\"hello\\"", "another,phrase"' as AssertionValue,
      outputString: 'SAY "HELLO" AND ANOTHER,PHRASE HERE',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should handle quoted values with commas case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: '"Hello, World","Foo"' },
      renderedValue: '"Hello, World","Foo"' as AssertionValue,
      outputString: 'HELLO, WORLD AND FOO',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should handle empty string value', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: '""' },
      renderedValue: '""' as AssertionValue,
      outputString: 'hello',
      inverse: false,
    };

    const result = handleIContainsAll(params);
    expect(result.pass).toBe(true);
  });

  it('should pass when output contains all expected strings case-insensitively', () => {
    const params: AssertionParams = {
      ...defaultParams,
      assertion: { type: 'icontains-all', value: ['HELLO', 'WORLD'] },
      renderedValue: ['HELLO', 'WORLD'] as AssertionValue,
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
      renderedValue: ['HELLO', 'WORLD', 'UNIVERSE'] as AssertionValue,
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
      renderedValue: ['HeLLo', 'WoRLD'] as AssertionValue,
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
