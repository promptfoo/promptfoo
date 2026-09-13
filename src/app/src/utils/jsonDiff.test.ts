import { describe, expect, it } from 'vitest';
import {
  buildUnifiedJsonDiff,
  computeJsonDiff,
  formatDiffValue,
  getJsonDiffExpectedValue,
  isJsonAssertion,
  tryParseJson,
} from './jsonDiff';
import type { Assertion, GradingResult } from '@promptfoo/types';

describe('computeJsonDiff', () => {
  it('returns empty array for identical objects', () => {
    const obj = { name: 'John', age: 30 };
    expect(computeJsonDiff(obj, obj)).toEqual([]);
  });

  it('returns empty array for identical empty containers', () => {
    expect(computeJsonDiff({}, {})).toEqual([]);
    expect(computeJsonDiff([], [])).toEqual([]);
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

  it('treats array and object values as a changed value rather than matching indexed keys', () => {
    expect(computeJsonDiff([1, 2], { '0': 1, '1': 2 })).toEqual([
      {
        path: '(root)',
        expected: [1, 2],
        actual: { '0': 1, '1': 2 },
        type: 'changed',
      },
    ]);
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
      type: 'changed',
    });
  });

  it('quotes object keys that could be mistaken for nested or array paths', () => {
    const diffs = computeJsonDiff(
      { 'user.name': 'Jane', '0': 'first', user: { 'first[name]': 'Jane' } },
      { 'user.name': 'John', '0': 'second', user: { 'first[name]': 'John' } },
    );

    expect(diffs.map((diff) => diff.path)).toEqual([
      '["0"]',
      '["user.name"]',
      'user["first[name]"]',
    ]);
  });

  it('handles type mismatches', () => {
    const expected = { value: '30' };
    const actual = { value: 30 };
    const diffs = computeJsonDiff(expected, actual);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('changed');
  });

  it('classifies object keys that shadow prototype properties using own properties', () => {
    expect(computeJsonDiff({}, { constructor: 'custom', toString: 'custom' })).toEqual([
      {
        path: 'constructor',
        expected: undefined,
        actual: 'custom',
        type: 'added',
      },
      {
        path: 'toString',
        expected: undefined,
        actual: 'custom',
        type: 'added',
      },
    ]);

    expect(computeJsonDiff({ constructor: 'custom' }, {})).toEqual([
      {
        path: 'constructor',
        expected: 'custom',
        actual: undefined,
        type: 'removed',
      },
    ]);
  });

  it('treats non-plain objects as changed values instead of empty records', () => {
    const expected = new Date('2026-01-01T00:00:00.000Z');
    const actual = {};

    expect(computeJsonDiff(expected, actual)).toEqual([
      {
        path: '(root)',
        expected,
        actual,
        type: 'changed',
      },
    ]);
  });

  it('handles deeply nested structures', () => {
    const expected = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: 'expected',
              },
            },
          },
        },
      },
    };
    const actual = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                value: 'actual',
              },
            },
          },
        },
      },
    };

    expect(computeJsonDiff(expected, actual)).toEqual([
      {
        path: 'level1.level2.level3.level4.level5.value',
        expected: 'expected',
        actual: 'actual',
        type: 'changed',
      },
    ]);
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
        value: null as unknown as Assertion['value'],
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

  it('does not fall back to raw JSON templates when the rendered value is null', () => {
    const result: GradingResult = {
      pass: false,
      score: 0,
      reason: 'test',
      assertion: {
        type: 'equals',
        value: { name: '{{expectedName}}' },
      },
      metadata: {
        renderedAssertionValue: null,
      },
    };

    expect(isJsonAssertion(result)).toBe(false);
    expect(getJsonDiffExpectedValue(result)).toBeUndefined();
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

  it('parses JSON null distinctly from invalid input', () => {
    expect(tryParseJson('null')).toBeNull();
  });

  it('returns undefined for invalid JSON', () => {
    expect(tryParseJson('not json')).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(tryParseJson(undefined)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(tryParseJson(null)).toBeUndefined();
  });

  it('does not compare JSON embedded in surrounding text as the entire equals output', () => {
    const text = 'Here is the result: {"name": "John"} end of output';
    expect(tryParseJson(text)).toBeUndefined();
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
    expect(formatDiffValue('say "hello"\nnext')).toBe('"say \\"hello\\"\\nnext"');
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

describe('buildUnifiedJsonDiff', () => {
  it('preserves unchanged lines after an insertion', () => {
    const lines = buildUnifiedJsonDiff({ a: 1, c: 3 }, { a: 1, b: 2, c: 3 });

    expect(lines).toContainEqual({ type: 'added', content: '  "b": 2,' });
    expect(lines.filter((line) => line.content.includes('"c"'))).toEqual([
      { type: 'same', content: '  "c": 3' },
    ]);
  });

  it('marks only changed JSON lines as removed or added', () => {
    const lines = buildUnifiedJsonDiff({ a: 1, b: 2 }, { a: 1, b: 3 });

    expect(lines).toContainEqual({ type: 'removed', content: '  "b": 2' });
    expect(lines).toContainEqual({ type: 'added', content: '  "b": 3' });
    expect(lines.filter((line) => line.content.includes('"a"'))).toEqual([
      { type: 'same', content: '  "a": 1,' },
    ]);
  });
});
