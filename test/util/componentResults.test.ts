import { describe, expect, it } from 'vitest';
import { countedComponentResults } from '../../src/types/index';

import type { GradingResult } from '../../src/types/index';

describe('countedComponentResults', () => {
  it.each(['assertion', 'metadata'] as const)(
    'counts legacy non-boolean %s markers without changing stored values',
    (marker) => {
      const components = [null, false, 0, 1, 'false', 'true', '1', [], {}].map(
        (metricOnly) =>
          ({
            pass: false,
            score: 0,
            reason: 'Legacy result',
            [marker]: { metricOnly },
          }) as unknown as GradingResult,
      );
      const metricOnly: GradingResult = {
        pass: false,
        score: 0,
        reason: 'Metric only',
        [marker]: { metricOnly: true },
      };
      expect(countedComponentResults([...components, metricOnly])).toEqual(components);
    },
  );

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
