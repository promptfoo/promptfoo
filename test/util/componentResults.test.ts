import { describe, expect, it } from 'vitest';
import { countedComponentResults } from '../../src/types/index';

describe('countedComponentResults', () => {
  it('returns an empty array for null or undefined input', () => {
    expect(countedComponentResults(undefined)).toEqual([]);
    expect(countedComponentResults(null)).toEqual([]);
  });

  it('drops null entries and metric-only results, keeping everything else', () => {
    const counted = { pass: true, score: 1, reason: 'ok', assertion: { type: 'equals' as const } };
    const metricOnly = {
      pass: false,
      score: 0,
      reason: 'counter',
      assertion: { type: 'javascript' as const, metricOnly: true },
    };
    const noAssertion = { pass: false, score: 0, reason: 'grader failed, no assertion object' };

    expect(countedComponentResults([counted, null, metricOnly, undefined, noAssertion])).toEqual([
      counted,
      noAssertion,
    ]);
  });
});
