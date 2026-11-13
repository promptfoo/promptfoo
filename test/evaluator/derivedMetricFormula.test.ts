import { describe, expect, it } from 'vitest';
import { compileDerivedMetricFormula } from '../../src/evaluator/derivedMetricFormula';

describe('derived metric formulas', () => {
  const scores = { total: 6, __count: 2 };

  it.each([
    ['-(total + 2) / +__count + 0.5 * 1e1', 1],
    ['total >= 6 ? total / __count : missing', 3],
    ['total == __count ? missing : (total - 2)', 4],
    ['(total > 0) == (__count >= 2)', 1],
  ])('evaluates %s', (formula, expected) => {
    expect(compileDerivedMetricFormula('score', formula)(scores)).toBe(expected);
  });

  it.each([
    'score = 7',
    'total; 42',
    '0 < total < 1 ? 1 : 0',
    'total == 6 < __count',
    'total.constructor',
    'total["name"]',
    '1 ? 42 : evaluate("2+2")',
    '2 ^ 3',
    '"3" + 1',
    '1'.repeat(1025),
  ])('rejects unsupported syntax: %.40s', (formula) => {
    expect(() => compileDerivedMetricFormula('score', formula)).toThrow('Invalid formula');
  });

  it('reads only numeric scores owned by the current evaluation', () => {
    const formula = compileDerivedMetricFormula('score', 'total + 1');
    expect(() => formula(Object.create(scores))).toThrow('Missing numeric score');
  });
});
