import { AssertionsResult } from '../../src/assertions/assertionsResult';
import type { AssertionSet, GradingResult } from '../../src/types';

describe('AssertionsResult', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES;
  });

  const succeedingResult = {
    pass: true,
    score: 1,
    reason: 'The succeeding reason',
    tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
    assertion: null,
  };
  const failingResult = {
    pass: false,
    score: 0,
    reason: 'The failing reason',
    tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
    assertion: null,
  };
  const testResult = {
    pass: true,
    score: 1,
    reason: 'All assertions passed',
    componentResults: [succeedingResult],
    namedScores: {},
    assertion: null,
    tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
  };
  let assertionsResult: AssertionsResult;

  beforeEach(() => {
    assertionsResult = new AssertionsResult();
  });

  it('can return a succeeding testResult', async () => {
    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual(testResult);
  });

  it('can return a failing testResult', async () => {
    assertionsResult.addResult({
      index: 0,
      result: failingResult,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual({
      ...testResult,
      pass: false,
      reason: failingResult.reason,
      score: 0,
      componentResults: [failingResult],
    });
  });

  it('handles PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES', () => {
    process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES = 'true';
    expect(() =>
      assertionsResult.addResult({
        index: 0,
        result: failingResult,
      }),
    ).toThrow(new Error(failingResult.reason));
  });

  it('handles named metrics', async () => {
    const metric = 'metric-name';

    assertionsResult.addResult({
      index: 0,
      metric,
      result: succeedingResult,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual({
      ...testResult,
      namedScores: {
        [metric]: 1,
      },
    });
  });

  it('handles result without tokensUsed', async () => {
    const resultWithoutTokensUsed = {
      ...succeedingResult,
      tokensUsed: undefined,
    };

    assertionsResult.addResult({
      index: 0,
      result: resultWithoutTokensUsed,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual({
      ...testResult,
      componentResults: [resultWithoutTokensUsed],
      tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
    });
  });

  it('respects succeeding threshold', async () => {
    const threshold = 0.5;

    assertionsResult = new AssertionsResult({ threshold });

    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual({
      ...testResult,
      reason: 'Aggregate score 1.00 ≥ 0.5 threshold',
    });
  });

  it('respects failing threshold', async () => {
    const threshold = 0.5;
    const failingResult = {
      ...succeedingResult,
      score: 0.4,
    };

    assertionsResult = new AssertionsResult({ threshold });

    assertionsResult.addResult({
      index: 0,
      result: failingResult,
    });

    await expect(assertionsResult.testResult()).resolves.toEqual({
      ...testResult,
      pass: false,
      reason: 'Aggregate score 0.40 < 0.5 threshold',
      score: 0.4,
      componentResults: [failingResult],
    });
  });

  it('can use a parentAssertionSet', () => {
    const parentAssertionSet = {
      index: 3,
      assertionSet: {
        type: 'assert-set',
        assert: [],
      } satisfies AssertionSet,
    };

    assertionsResult = new AssertionsResult({ parentAssertionSet });

    expect(assertionsResult.parentAssertionSet).toBe(parentAssertionSet);
  });

  it('flattens nested componentResults', async () => {
    assertionsResult = new AssertionsResult();

    const nestedResult: GradingResult = {
      pass: true,
      score: 0.8,
      reason: 'Nested assertion passed',
      componentResults: [
        {
          pass: true,
          score: 0.9,
          reason: 'Sub-assertion 1 passed',
          assertion: { type: 'equals', value: 'test' },
        },
        {
          pass: true,
          score: 0.7,
          reason: 'Sub-assertion 2 passed',
          assertion: { type: 'contains', value: 'example' },
        },
      ],
      assertion: { type: 'python', value: 'path/to/file.py' },
    };

    assertionsResult.addResult({
      index: 0,
      result: nestedResult,
    });

    const result = await assertionsResult.testResult();

    expect(result.componentResults).toBeDefined();
    expect(result.componentResults).toHaveLength(3);
    expect(result.componentResults?.[0]).toEqual(nestedResult);
    expect(result.componentResults?.[1]).toEqual({
      ...nestedResult.componentResults?.[0],
      assertion: nestedResult.componentResults?.[0].assertion || nestedResult.assertion,
    });
    expect(result.componentResults?.[2]).toEqual({
      ...nestedResult.componentResults?.[1],
      assertion: nestedResult.componentResults?.[1].assertion || nestedResult.assertion,
    });
  });

  describe('noAssertsResult', () => {
    it('returns correct value', () => {
      expect(AssertionsResult.noAssertsResult()).toEqual({
        pass: true,
        score: 1,
        reason: 'No assertions',
        tokensUsed: { total: 0, prompt: 0, completion: 0, cached: 0 },
        assertion: null,
      });
    });
  });

  it('handles redteam guardrails', async () => {
    const redteamGuardrailResult = {
      pass: false,
      score: 0,
      reason: 'Failed guardrail check',
      tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
      assertion: {
        type: 'guardrails' as const,
        config: {
          purpose: 'redteam',
        },
      },
    };

    assertionsResult.addResult({
      index: 0,
      result: redteamGuardrailResult,
    });

    const result = await assertionsResult.testResult();
    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Content failed guardrail safety checks');
  });

  it('handles multiple named scores from different sources', async () => {
    const resultWithNamedScores = {
      pass: true,
      score: 1,
      reason: 'Test passed',
      tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
      namedScores: {
        'metric-1': 0.8,
        'metric-2': 0.9,
      },
    };

    assertionsResult.addResult({
      index: 0,
      metric: 'metric-3',
      result: resultWithNamedScores,
    });

    const result = await assertionsResult.testResult();
    expect(result.namedScores).toEqual({
      'metric-1': 0.8,
      'metric-2': 0.9,
      'metric-3': 1,
    });
  });

  it('handles scoring function errors', async () => {
    const mockScoringFunction = jest.fn().mockImplementation(() => {
      throw new Error('Scoring function failed');
    });

    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    const result = await assertionsResult.testResult(mockScoringFunction);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe('Scoring function error: Scoring function failed');
  });

  it('handles invalid scoring function return value', async () => {
    const mockScoringFunction = jest.fn().mockReturnValue('invalid');

    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    const result = await assertionsResult.testResult(mockScoringFunction);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(
      'Scoring function error: assertion scoring function must return a GradingResult',
    );
  });

  it('handles named scores with undefined metric', async () => {
    const resultWithNamedScores = {
      pass: true,
      score: 1,
      reason: 'Test passed',
      tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
      namedScores: {
        'metric-1': 0.8,
      } as Record<string, number>,
    };

    assertionsResult.addResult({
      index: 0,
      result: resultWithNamedScores,
    });

    const result = await assertionsResult.testResult();
    expect(result.namedScores).toEqual({
      'metric-1': 0.8,
    });
  });

  it('handles scoring function with async GradingResult', async () => {
    const mockScoringFunction = jest.fn().mockResolvedValue({
      pass: true,
      score: 0.9,
      reason: 'Async scoring result',
    });

    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    const result = await assertionsResult.testResult(mockScoringFunction);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.reason).toBe('Async scoring result');
  });

  it('handles multiple named scores with undefined metrics', async () => {
    const resultWithNamedScores = {
      pass: true,
      score: 1,
      reason: 'Test passed',
      tokensUsed: { total: 1, prompt: 2, completion: 3, cached: 0 },
      namedScores: {
        'metric-1': 0.8,
      } as Record<string, number>,
    };

    assertionsResult.addResult({
      index: 0,
      result: resultWithNamedScores,
    });

    const result = await assertionsResult.testResult();
    expect(result.namedScores).toEqual({
      'metric-1': 0.8,
    });
  });
});
