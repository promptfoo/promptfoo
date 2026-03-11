import { describe, expect, it } from 'vitest';
import {
  calculatePassPowerOfN,
  calculatePassPowerOfNFromResults,
} from '../../src/util/passPowerOfN';

function makeResult(
  testIdx: number,
  promptIdx: number,
  vars: Record<string, unknown>,
  success: boolean,
) {
  return { testIdx, promptIdx, vars, success };
}

describe('calculatePassPowerOfN', () => {
  it('returns 100% when all tests pass', () => {
    const results = [
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
    ];

    const result = calculatePassPowerOfN(results, 4);

    expect(result.n).toBe(4);
    expect(result.overallScore).toBe(100);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].passRate).toBe(1);
    expect(result.groups[0].passPowerN).toBe(1);
    expect(result.groups[0].totalRepetitions).toBe(4);
    expect(result.groups[0].successes).toBe(4);
  });

  it('returns 0% when all tests fail', () => {
    const results = [
      makeResult(0, 0, { input: 'hello' }, false),
      makeResult(0, 0, { input: 'hello' }, false),
      makeResult(0, 0, { input: 'hello' }, false),
    ];

    const result = calculatePassPowerOfN(results, 3);

    expect(result.overallScore).toBe(0);
    expect(result.groups[0].passRate).toBe(0);
    expect(result.groups[0].passPowerN).toBe(0);
  });

  it('calculates pass^N correctly for partial pass rate', () => {
    // 3 out of 4 pass = 75% pass rate
    // pass^4 = 0.75^4 = 0.31640625
    const results = [
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, false),
    ];

    const result = calculatePassPowerOfN(results, 4);

    expect(result.groups[0].passRate).toBe(0.75);
    expect(result.groups[0].passPowerN).toBeCloseTo(0.31640625);
    expect(result.overallScore).toBeCloseTo(31.640625);
  });

  it('handles multiple test groups independently', () => {
    const results = [
      // Test group 1: 100% pass rate
      makeResult(0, 0, { input: 'a' }, true),
      makeResult(0, 0, { input: 'a' }, true),
      // Test group 2: 50% pass rate
      makeResult(1, 0, { input: 'b' }, true),
      makeResult(1, 0, { input: 'b' }, false),
    ];

    const result = calculatePassPowerOfN(results, 2);

    expect(result.groups).toHaveLength(2);

    const groupA = result.groups.find((g) => g.varsKey === JSON.stringify({ input: 'a' }));
    const groupB = result.groups.find((g) => g.varsKey === JSON.stringify({ input: 'b' }));

    expect(groupA?.passRate).toBe(1);
    expect(groupA?.passPowerN).toBe(1); // 1^2 = 1

    expect(groupB?.passRate).toBe(0.5);
    expect(groupB?.passPowerN).toBe(0.25); // 0.5^2 = 0.25

    // Average: (1 + 0.25) / 2 = 0.625 -> 62.5%
    expect(result.overallScore).toBeCloseTo(62.5);
  });

  it('groups by promptIdx as well as vars', () => {
    const results = [
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 1, { input: 'hello' }, true),
      makeResult(0, 1, { input: 'hello' }, false),
    ];

    const result = calculatePassPowerOfN(results, 2);

    expect(result.groups).toHaveLength(2);

    const prompt0 = result.groups.find((g) => g.promptIdx === 0);
    const prompt1 = result.groups.find((g) => g.promptIdx === 1);

    expect(prompt0?.passPowerN).toBe(1); // 1^2
    expect(prompt1?.passPowerN).toBe(0.25); // 0.5^2
  });

  it('handles N=1 (pass^1 equals pass rate)', () => {
    const results = [
      makeResult(0, 0, { input: 'hello' }, true),
      makeResult(0, 0, { input: 'hello' }, false),
    ];

    const result = calculatePassPowerOfN(results, 1);

    expect(result.groups[0].passRate).toBe(0.5);
    expect(result.groups[0].passPowerN).toBe(0.5);
    expect(result.overallScore).toBe(50);
  });

  it('handles N <= 0 by returning 100%', () => {
    const results = [makeResult(0, 0, { input: 'hello' }, false)];

    expect(calculatePassPowerOfN(results, 0).overallScore).toBe(100);
    expect(calculatePassPowerOfN(results, -1).overallScore).toBe(100);
  });

  it('handles empty results', () => {
    const result = calculatePassPowerOfN([], 4);

    expect(result.overallScore).toBe(100);
    expect(result.groups).toHaveLength(0);
  });

  it('produces stable grouping regardless of vars key order', () => {
    const results = [
      makeResult(0, 0, { a: 1, b: 2 }, true),
      makeResult(0, 0, { b: 2, a: 1 }, false),
    ];

    const result = calculatePassPowerOfN(results, 2);

    // Should be grouped together despite different key order
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].totalRepetitions).toBe(2);
    expect(result.groups[0].passRate).toBe(0.5);
  });

  it('handles single repetition per test (pass^N is 0 or 1)', () => {
    const results = [
      makeResult(0, 0, { input: 'a' }, true),
      makeResult(1, 0, { input: 'b' }, false),
    ];

    const result = calculatePassPowerOfN(results, 4);

    expect(result.groups).toHaveLength(2);

    const groupA = result.groups.find((g) => g.varsKey === JSON.stringify({ input: 'a' }));
    const groupB = result.groups.find((g) => g.varsKey === JSON.stringify({ input: 'b' }));

    expect(groupA?.passPowerN).toBe(1); // 1^4 = 1
    expect(groupB?.passPowerN).toBe(0); // 0^4 = 0
  });

  it('uses power different from repetition count', () => {
    // 10 repetitions, 9 pass = 90% rate, compute pass^4
    const results = Array.from({ length: 10 }, (_, i) => ({
      testIdx: 0,
      promptIdx: 0,
      vars: { input: 'test' },
      success: i < 9,
    }));

    const result = calculatePassPowerOfN(results, 4);

    expect(result.groups[0].passRate).toBeCloseTo(0.9);
    expect(result.groups[0].passPowerN).toBeCloseTo(0.6561); // 0.9^4
    expect(result.overallScore).toBeCloseTo(65.61);
  });

  it('does not merge separate tests that share vars', () => {
    const results = [
      makeResult(0, 0, { input: 'same' }, true),
      makeResult(0, 0, { input: 'same' }, true),
      makeResult(1, 0, { input: 'same' }, true),
      makeResult(1, 0, { input: 'same' }, false),
    ];

    const summary = calculatePassPowerOfN(results, 2);

    expect(summary.groups).toHaveLength(2);
    expect(summary.overallScore).toBeCloseTo(62.5);
  });

  it('prefers testCase vars when calculating from eval results', () => {
    const summary = calculatePassPowerOfNFromResults(
      [
        { testIdx: 0, promptIdx: 0, vars: {}, testCase: { vars: { input: 'a' } }, success: true },
        { testIdx: 0, promptIdx: 0, vars: {}, testCase: { vars: { input: 'a' } }, success: false },
        { testIdx: 1, promptIdx: 0, vars: {}, testCase: { vars: { input: 'b' } }, success: true },
        { testIdx: 1, promptIdx: 0, vars: {}, testCase: { vars: { input: 'b' } }, success: true },
      ],
      2,
    );

    expect(summary.groups).toHaveLength(2);
    expect(summary.overallScore).toBeCloseTo(62.5);
  });
});
