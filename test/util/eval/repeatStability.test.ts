import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../../src/types';
import {
  calculateRepeatStability,
  getWilsonScoreInterval,
  RepeatStabilityCalculator,
} from '../../../src/util/eval/repeatStability';
import { createEvaluateResult } from '../../factories/eval';
import { createGradingResult } from '../../factories/gradingResult';
import { createProviderResponse } from '../../factories/provider';

describe('calculateRepeatStability', () => {
  it('returns undefined when no repeated results are present', () => {
    expect(calculateRepeatStability([createEvaluateResult()])).toBeUndefined();
  });

  it('groups repeated results and reports instability, errors, and cache use', () => {
    const base = {
      repeatGroupId: 'test-0-vars-0',
      promptIdx: 0,
      provider: { id: 'provider-a', label: 'Provider A' },
    };
    const results = [
      createEvaluateResult({ ...base, repeatIndex: 0, success: true }),
      createEvaluateResult({ ...base, repeatIndex: 1, success: true }),
      createEvaluateResult({
        ...base,
        repeatIndex: 2,
        success: false,
        error: 'assertion failed',
        failureReason: ResultFailureReason.ASSERT,
      }),
      createEvaluateResult({
        ...base,
        repeatGroupId: 'test-1-vars-0',
        repeatIndex: 0,
        success: true,
      }),
      createEvaluateResult({
        ...base,
        repeatGroupId: 'test-1-vars-0',
        repeatIndex: 1,
        success: true,
        gradingResult: createGradingResult({ metadata: { cachedResponse: true } }),
      }),
      createEvaluateResult({
        ...base,
        repeatGroupId: 'test-2-vars-0',
        repeatIndex: 0,
        success: false,
        error: 'provider failed',
        failureReason: ResultFailureReason.ERROR,
        response: createProviderResponse({ cached: true }),
      }),
    ];

    const summary = calculateRepeatStability(results);

    expect(summary).toMatchObject({
      totalGroups: 3,
      unstableGroups: 1,
      groupsWithErrors: 1,
      cachedResults: 2,
    });
    expect(summary?.groups[0]).toMatchObject({
      repeatGroupId: 'test-0-vars-0',
      repetitions: 3,
      passed: 2,
      failed: 1,
      errors: 0,
      cached: 0,
      passRate: 2 / 3,
      unstable: true,
    });
    expect(summary?.groups[0].passRateConfidenceInterval?.lower).toBeCloseTo(0.2077, 4);
    expect(summary?.groups[0].passRateConfidenceInterval?.upper).toBeCloseTo(0.9385, 4);
    expect(summary?.groups[1].passRateConfidenceInterval).toBeUndefined();
    expect(summary?.groups[2]).toMatchObject({ errors: 1, cached: 1 });
  });

  it('can aggregate batches without retaining every result', () => {
    const calculator = new RepeatStabilityCalculator();
    calculator.addResults([
      createEvaluateResult({ repeatGroupId: 'group', repeatIndex: 0, success: true }),
    ]);
    calculator.addResults([
      createEvaluateResult({ repeatGroupId: 'group', repeatIndex: 1, success: false }),
    ]);

    expect(calculator.getSummary()?.groups[0]).toMatchObject({
      repetitions: 2,
      passed: 1,
      failed: 1,
      unstable: true,
    });
  });
});

describe('getWilsonScoreInterval', () => {
  it('handles boundary pass rates without leaving the probability range', () => {
    expect(getWilsonScoreInterval(0, 3)).toMatchObject({ confidenceLevel: 0.95, lower: 0 });
    expect(getWilsonScoreInterval(3, 3)).toMatchObject({ confidenceLevel: 0.95, upper: 1 });
    expect(getWilsonScoreInterval(0, 0)).toBeUndefined();
  });
});
