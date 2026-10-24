import { describe, expect, it } from 'vitest';
import {
  extractNumbers,
  getStatedAnswerText,
  handleNumericMatch,
} from '../../src/assertions/numericMatch';

import type { Assertion, AssertionParams } from '../../src/types/index';

function runNumericMatch(
  output: string,
  value: unknown,
  options: { threshold?: number; mode?: string; inverse?: boolean } = {},
) {
  const assertion: Assertion = {
    type: options.inverse ? 'not-numeric-match' : 'numeric-match',
    value: value as Assertion['value'],
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.mode === undefined ? {} : { config: { mode: options.mode } }),
  };
  return handleNumericMatch({
    assertion,
    baseType: 'numeric-match',
    inverse: options.inverse ?? false,
    output,
    outputString: output,
    renderedValue: value as AssertionParams['renderedValue'],
    providerResponse: { output },
    test: {},
    assertionValueContext: {} as AssertionParams['assertionValueContext'],
  });
}

describe('extractNumbers', () => {
  it.each([
    ['$416.2 billion', 416.2e9],
    ['416,161 million', 416_161e6],
    ['$416.16B', 416.16e9],
    ['416161000000', 416_161_000_000],
    ['€3.5bn', 3.5e9],
    ['£12 mn', 12e6],
    ['250K', 250e3],
    ['1.2 trillion', 1.2e12],
    ['5 thousand', 5e3],
    ['(1,234)', -1234],
    ['-3.5', -3.5],
    ['$-42', -42],
    ['.75', 0.75],
  ])('normalizes %s', (text, expected) => {
    expect(extractNumbers(text)).toEqual([expected]);
  });

  it('ignores digits inside words', () => {
    expect(extractNumbers('Apple FY2025 Q3 revenue was $94.0 billion')).toEqual([94e9]);
  });

  it('does not treat a following word as a scale suffix', () => {
    expect(extractNumbers('5 months and 3 bottles')).toEqual([5, 3]);
  });

  it('returns every number in order', () => {
    expect(extractNumbers('From $391.0 billion to $416.2 billion')).toEqual([391e9, 416.2e9]);
  });
});

describe('getStatedAnswerText', () => {
  it('returns the last final answer line', () => {
    expect(
      getStatedAnswerText('Revenue was $90.7 billion.\nFinal answer: $89.3 billion\nThanks'),
    ).toBe('$89.3 billion');
  });

  it('returns the whole output when there is no final answer line', () => {
    expect(getStatedAnswerText('About $5 million')).toBe('About $5 million');
  });
});

describe('handleNumericMatch', () => {
  it.each(['$416.2 billion', '416,161 million', '$416.16B', '416161000000'])(
    'passes a correct answer written as %s',
    (output) => {
      const result = runNumericMatch(`Total net sales were ${output}.`, 416_161_000_000);
      expect(result.pass).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    },
  );

  it('fails the prior-year figure that a contains check would accept', () => {
    const result = runNumericMatch('Total net sales were $391.0 billion.', 416_161_000_000);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('391000000000');
  });

  it('grades the final answer line instead of other numbers in the output', () => {
    const output = 'Operating income was $90.7 billion in one view.\nFinal answer: $89.3 billion';
    expect(runNumericMatch(output, 90.7e9).pass).toBe(false);
    expect(runNumericMatch(output, 89.3e9).pass).toBe(true);
  });

  it('accepts a numeric string as the expected value', () => {
    expect(runNumericMatch('About 416,161 million', '$416.161 billion').pass).toBe(true);
  });

  it('uses the threshold as the relative tolerance', () => {
    expect(runNumericMatch('105', 100, { threshold: 0.05 }).pass).toBe(true);
    expect(runNumericMatch('106', 100, { threshold: 0.05 }).pass).toBe(false);
  });

  it('scores near misses above wild misses', () => {
    const exact = runNumericMatch('100', 100, { threshold: 0.1 });
    const near = runNumericMatch('103', 100, { threshold: 0.1 });
    const far = runNumericMatch('150', 100, { threshold: 0.1 });
    expect(exact.score).toBe(1);
    expect(near.score).toBeCloseTo(0.7);
    expect(far.score).toBe(0);
  });

  it('supports first, last and closest modes', () => {
    const output = 'Last year 391 billion, this year 416 billion, next year 450 billion';
    expect(runNumericMatch(output, 416e9).pass).toBe(false);
    expect(runNumericMatch(output, 450e9, { mode: 'last' }).pass).toBe(true);
    expect(runNumericMatch(output, 416e9, { mode: 'closest' }).pass).toBe(true);
  });

  it('uses absolute error when the expected value is zero', () => {
    expect(runNumericMatch('0.001', 0, { threshold: 0.01 }).pass).toBe(true);
    expect(runNumericMatch('0.5', 0, { threshold: 0.01 }).pass).toBe(false);
  });

  it('handles accounting negatives', () => {
    expect(runNumericMatch('Net loss: (1,234)', -1234).pass).toBe(true);
    expect(runNumericMatch('Net loss: (1,234)', 1234).pass).toBe(false);
  });

  it('fails when the output has no number', () => {
    const result = runNumericMatch('I could not find that figure.', 42);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('no number was found');
  });

  it('inverts the result for not-numeric-match', () => {
    const near = runNumericMatch('100', 100, { inverse: true });
    expect(near.pass).toBe(false);
    expect(near.score).toBe(0);
    const far = runNumericMatch('200', 100, { inverse: true });
    expect(far.pass).toBe(true);
    expect(far.score).toBe(1);
    expect(runNumericMatch('no numbers', 100, { inverse: true }).pass).toBe(true);
  });

  it('rejects invalid configuration', () => {
    expect(() => runNumericMatch('1', 'one and two: 1, 2')).toThrow('exactly one number');
    expect(() => runNumericMatch('1', { a: 1 })).toThrow('number or numeric string');
    expect(() => runNumericMatch('1', 1, { threshold: -1 })).toThrow('non-negative');
    expect(() => runNumericMatch('1', 1, { mode: 'median' })).toThrow('config.mode');
  });
});
