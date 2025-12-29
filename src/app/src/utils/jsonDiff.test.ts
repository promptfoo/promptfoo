import { describe, expect, it } from 'vitest';
import { computeJsonDiff, formatDiffValue, isJsonAssertion, tryParseJson } from './jsonDiff';
import type { GradingResult } from '@promptfoo/types';

describe('computeJsonDiff', () => {
  it('returns empty array for identical objects', () => {
    const obj = { name: 'John', age: 30 };
    expect(computeJsonDiff(obj, obj)).toEqual([]);
  });

  it('detects changed primitive values', () => {
    const expected = { age: 30 };
    const actual = { age: 31 };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'age',
      expected: 30,
      actual: 31,
      type: 'changed',
    });
  });

  it('detects added keys', () => {
    const expected = { name: 'John' };
    const actual = { name: 'John', age: 31 };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'age',
      expected: undefined,
      actual: 31,
      type: 'added',
    });
  });

  it('detects removed keys', () => {
    const expected = { name: 'John', age: 30 };
    const actual = { name: 'John' };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'age',
      expected: 30,
      actual: undefined,
      type: 'removed',
    });
  });

  it('handles nested objects', () => {
    const expected = { user: { name: 'John', age: 30 } };
    const actual = { user: { name: 'John', age: 31 } };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'user.age',
      expected: 30,
      actual: 31,
      type: 'changed',
    });
  });

  it('handles arrays', () => {
    const expected = { items: [1, 2, 3] };
    const actual = { items: [1, 2, 4] };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'items[2]',
      expected: 3,
      actual: 4,
      type: 'changed',
    });
  });

  it('handles array length differences', () => {
    const expected = { items: [1, 2] };
    const actual = { items: [1, 2, 3] };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'items[2]',
      expected: undefined,
      actual: 3,
      type: 'added',
    });
  });

  it('handles null values', () => {
    const expected = { value: null };
    const actual = { value: 'something' };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({
      path: 'value',
      expected: null,
      actual: 'something',
      type: 'added',
    });
  });

  it('handles type mismatches', () => {
    const expected = { value: '30' };
    const actual = { value: 30 };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('changed');
  });
});

describe('isJsonAssertion', () => {
  it('returns true for equals with object value', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'equals',
        value: { name: 'John' },
      },
    };
    expect(isJsonAssertion(result)).toBe(true);
  });

  it('returns true for equals with array value', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'equals',
        value: [1, 2, 3],
      },
    };
    expect(isJsonAssertion(result)).toBe(true);
  });

  it('returns false for equals with string value', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'equals',
        value: 'hello',
      },
    };
    expect(isJsonAssertion(result)).toBe(false);
  });

  it('returns false for equals with null value', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'equals',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: null as any, // Test runtime null handling
      },
    };
    expect(isJsonAssertion(result)).toBe(false);
  });

  it('returns false for contains-json (uses schema validation)', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'contains-json',
        value: { type: 'object', properties: {} },
      },
    };
    expect(isJsonAssertion(result)).toBe(false);
  });

  it('returns false for is-json (uses schema validation)', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'is-json',
        value: { type: 'object' },
      },
    };
    expect(isJsonAssertion(result)).toBe(false);
  });

  it('returns false for other assertion types', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'contains',
        value: 'hello',
      },
    };
    expect(isJsonAssertion(result)).toBe(false);
  });

  it('returns false when assertion is undefined', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
    };
    expect(isJsonAssertion(result)).toBe(false);
  });
});

describe('tryParseJson', () => {
  it('parses valid JSON string', () => {
    const json = '{"name": "John", "age": 30}';
    expect(tryParseJson(json)).toEqual({ name: 'John', age: 30 });
  });

  it('parses JSON array', () => {
    const json = '[1, 2, 3]';
    expect(tryParseJson(json)).toEqual([1, 2, 3]);
  });

  it('returns null for invalid JSON', () => {
    expect(tryParseJson('not json')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(tryParseJson(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(tryParseJson(null)).toBeNull();
  });

  it('extracts JSON from text with surrounding content', () => {
    const text = 'Here is the result: {"name": "John"} end of output';
    expect(tryParseJson(text)).toEqual({ name: 'John' });
  });

  it('extracts JSON array from text', () => {
    const text = 'The array is [1, 2, 3] here';
    expect(tryParseJson(text)).toEqual([1, 2, 3]);
  });
});

describe('formatDiffValue', () => {
  it('formats undefined', () => {
    expect(formatDiffValue(undefined)).toBe('undefined');
  });

  it('formats null', () => {
    expect(formatDiffValue(null)).toBe('null');
  });

  it('formats strings with quotes', () => {
    expect(formatDiffValue('hello')).toBe('"hello"');
  });

  it('formats numbers', () => {
    expect(formatDiffValue(42)).toBe('42');
  });

  it('formats booleans', () => {
    expect(formatDiffValue(true)).toBe('true');
  });

  it('formats short objects', () => {
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}');
  });

  it('truncates long objects', () => {
    const longObject = { a: 'very long string that exceeds fifty characters' };
    const formatted = formatDiffValue(longObject);
    expect(formatted.length).toBe(50);
    expect(formatted.endsWith('...')).toBe(true);
  });
});
