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
  it('calculates pass^N for a partial pass rate', () => {
    const summary = calculatePassPowerOfN(
      [
        makeResult(0, 0, { input: 'hello' }, true),
        makeResult(0, 0, { input: 'hello' }, true),
        makeResult(0, 0, { input: 'hello' }, true),
        makeResult(0, 0, { input: 'hello' }, false),
      ],
      4,
    );

    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].passRate).toBe(0.75);
    expect(summary.groups[0].passPowerN).toBeCloseTo(0.31640625);
    expect(summary.overallScore).toBeCloseTo(31.640625);
  });

  it('merges repeats that share the same prompt and vars', () => {
    const summary = calculatePassPowerOfN(
      [
        makeResult(0, 0, { input: 'same' }, true),
        makeResult(0, 0, { input: 'same' }, true),
        makeResult(1, 0, { input: 'same' }, true),
        makeResult(1, 0, { input: 'same' }, false),
      ],
      2,
    );

    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].passRate).toBe(0.75);
    expect(summary.groups[0].passPowerN).toBeCloseTo(0.5625);
    expect(summary.overallScore).toBeCloseTo(56.25);
  });

  it('uses testCase vars when calculating from eval results', () => {
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
