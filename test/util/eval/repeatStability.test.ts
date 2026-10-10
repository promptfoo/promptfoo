import { describe, expect, it } from 'vitest';
import { AssertionsResult } from '../../../src/assertions/assertionsResult';
import { type GradingResult, ResultFailureReason } from '../../../src/types';
import {
  calculateRepeatStability,
  getWilsonScoreInterval,
  RepeatStabilityCalculator,
} from '../../../src/util/eval/repeatStability';
import { createEvaluateResult } from '../../factories/eval';
import { createGradingResult } from '../../factories/gradingResult';
import { createProviderResponse } from '../../factories/provider';

function createRepeatedResults(
  gradingResult: GradingResult | null | undefined,
  repeatGroupId = 'group',
) {
  return [0, 1].map((repeatIndex) =>
    createEvaluateResult({ repeatGroupId, repeatIndex, gradingResult }),
  );
}

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

  it.each([
    {
      name: 'mixed cached rubric and fresh deterministic grading',
      cachedComponents: [true, false],
      cachedResults: 2,
      aggregateCached: undefined,
    },
    {
      name: 'fresh grading',
      cachedComponents: [false, false],
      cachedResults: 0,
      aggregateCached: undefined,
    },
    {
      name: 'fully cached grading',
      cachedComponents: [true],
      cachedResults: 2,
      aggregateCached: true,
    },
  ])(
    'counts $name once per repeat result',
    async ({ cachedComponents, cachedResults, aggregateCached }) => {
      const assertions = new AssertionsResult({});
      cachedComponents.forEach((cachedResponse, index) => {
        assertions.addResult({
          index,
          result: createGradingResult({
            assertion: { type: index === 0 ? 'llm-rubric' : 'contains', value: 'safe' },
            metadata: { cachedResponse },
          }),
        });
      });
      const gradingResult = await assertions.testResult();
      const results = createRepeatedResults(gradingResult);

      // Both rows deliberately reuse the same real aggregate object.
      expect(results[0].gradingResult).toBe(results[1].gradingResult);
      expect(gradingResult.metadata?.cachedResponse).toBe(aggregateCached);
      const summary = calculateRepeatStability(results);

      expect(summary?.cachedResults).toBe(cachedResults);
      expect(summary?.groups[0]).toMatchObject({
        repetitions: 2,
        passed: 2,
        cached: cachedResults,
      });
      if (cachedResults > 0) {
        expect(summary?.groups[0].passRateConfidenceInterval).toBeUndefined();
      } else {
        expect(summary?.groups[0].passRateConfidenceInterval).toMatchObject({
          confidenceLevel: 0.95,
        });
      }
      expect(gradingResult.metadata?.cachedResponse).toBe(aggregateCached);
    },
  );

  it('finds cached grading under deep and shared components with fresh ancestor flags', () => {
    const sharedCached = createGradingResult({ metadata: { cachedResponse: true } });
    let gradingResult = createGradingResult({
      componentResults: [
        sharedCached,
        sharedCached,
        createGradingResult({ metadata: { cachedResponse: true } }),
      ],
    });
    for (let depth = 0; depth < 200; depth++) {
      gradingResult = createGradingResult({
        metadata: { cachedResponse: false },
        componentResults: [gradingResult],
      });
    }

    const summary = calculateRepeatStability(createRepeatedResults(gradingResult));

    expect(summary?.cachedResults).toBe(2);
    expect(summary?.groups[0].cached).toBe(2);
    expect(summary?.groups[0].passRateConfidenceInterval).toBeUndefined();
  });

  it('counts a row only once when target, aggregate, and several components are cached', () => {
    const results = createRepeatedResults(createGradingResult());
    results[0].response = createProviderResponse({ cached: true });
    results[0].gradingResult = createGradingResult({
      metadata: { cachedResponse: true },
      componentResults: [
        createGradingResult({ metadata: { cachedResponse: true } }),
        createGradingResult({ metadata: { cachedResponse: true } }),
      ],
    });

    const summary = calculateRepeatStability(results);

    expect(summary?.cachedResults).toBe(1);
    expect(summary?.groups[0]).toMatchObject({ repetitions: 2, cached: 1 });
    expect(summary?.groups[0].passRateConfidenceInterval).toBeUndefined();
  });

  it.each([
    ['missing grading', undefined],
    ['null grading', null],
    ['missing cache metadata', createGradingResult()],
    ['null components', createGradingResult({ componentResults: null })],
    ['empty components', createGradingResult({ componentResults: [] })],
    [
      'fresh components',
      createGradingResult({
        metadata: { cachedResponse: false },
        componentResults: [createGradingResult({ metadata: { cachedResponse: false } })],
      }),
    ],
  ] as const)('retains the interval for %s', (_name, gradingResult) => {
    const summary = calculateRepeatStability(createRepeatedResults(gradingResult));

    expect(summary?.cachedResults).toBe(0);
    expect(summary?.groups[0]).toMatchObject({ passed: 2, cached: 0 });
    expect(summary?.groups[0].passRateConfidenceInterval).toMatchObject({ confidenceLevel: 0.95 });
  });

  it('keeps final verdicts when fresh comparison grading retains earlier cached components', () => {
    const retainedCached = createGradingResult({ metadata: { cachedResponse: true } });
    const results = [true, false].map((pass, repeatIndex) =>
      createEvaluateResult({
        repeatGroupId: 'comparison',
        repeatIndex,
        success: pass,
        score: Number(pass),
        failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        gradingResult: createGradingResult({
          pass,
          score: Number(pass),
          componentResults: [retainedCached, createGradingResult({ pass, score: Number(pass) })],
        }),
      }),
    );
    results.push(
      createEvaluateResult({
        repeatGroupId: 'comparison',
        repeatIndex: 2,
        success: false,
        failureReason: ResultFailureReason.ERROR,
        error: 'Provider failed',
        gradingResult: null,
      }),
    );

    const summary = calculateRepeatStability(results);

    expect(summary?.cachedResults).toBe(2);
    expect(summary?.groups[0]).toMatchObject({
      repetitions: 3,
      passed: 1,
      failed: 1,
      errors: 1,
      passRate: 0.5,
      unstable: true,
    });
    expect(summary?.groups[0].passRateConfidenceInterval).toBeUndefined();
  });

  it('retains the interval for a fresh grading tree with historical cached tokens', () => {
    const gradingResult = createGradingResult({
      tokensUsed: { total: 100, prompt: 100, completion: 0, cached: 100, numRequests: 1 },
      componentResults: [createGradingResult({ metadata: { cachedResponse: false } })],
    });

    const summary = calculateRepeatStability(createRepeatedResults(gradingResult));

    expect(summary?.cachedResults).toBe(0);
    expect(summary?.groups[0].passRateConfidenceInterval).toMatchObject({ confidenceLevel: 0.95 });
  });

  it('suppresses the interval only for groups containing cached grading', () => {
    const cachedGrading = createGradingResult({
      componentResults: [createGradingResult({ metadata: { cachedResponse: true } })],
    });
    const summary = calculateRepeatStability([
      ...createRepeatedResults(cachedGrading, 'cached'),
      ...createRepeatedResults(createGradingResult(), 'fresh'),
    ]);

    expect(summary?.cachedResults).toBe(2);
    expect(
      summary?.groups.find((group) => group.repeatGroupId === 'cached')?.passRateConfidenceInterval,
    ).toBeUndefined();
    expect(
      summary?.groups.find((group) => group.repeatGroupId === 'fresh')?.passRateConfidenceInterval,
    ).toMatchObject({ confidenceLevel: 0.95 });
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
