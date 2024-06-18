import { AssertionSet } from '../../src/types';

import { AssertionsResult } from '../../src/assertions/AssertionsResult';

describe('AssertionsResult', () => {
  const succeedingResult = {
    pass: true,
    score: 1,
    reason: 'The succeeding reason',
    tokensUsed: { total: 1, prompt: 2, completion: 3 },
    assertion: null,
  };
  const failingResult = {
    pass: false,
    score: 0,
    reason: 'The failing reason',
    tokensUsed: { total: 1, prompt: 2, completion: 3 },
    assertion: null,
  };
  const testResult = {
    pass: true,
    score: 1,
    reason: 'All assertions passed',
    componentResults: [succeedingResult],
    namedScores: {},
    assertion: null,
    tokensUsed: { total: 1, prompt: 2, completion: 3 },
  };
  let assertionsResult: AssertionsResult;

  beforeEach(() => {
    assertionsResult = new AssertionsResult();
  });

  it('can return a succeeding testResult', () => {
    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    expect(assertionsResult.testResult()).toEqual(testResult);
  });

  it('can return a failing testResult', () => {
    assertionsResult.addResult({
      index: 0,
      result: failingResult,
    });

    expect(assertionsResult.testResult()).toEqual({
      ...testResult,
      pass: false,
      reason: failingResult.reason,
      score: 0,
      componentResults: [failingResult],
    });
  });

  it('handles PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES', () => {
    const initialEnv = process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES;
    process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES = 'true';

    expect(() =>
      assertionsResult.addResult({
        index: 0,
        result: failingResult,
      }),
    ).toThrow(new Error(failingResult.reason));

    process.env.PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES = initialEnv;
  });

  it('handles named metrics', () => {
    const metric = 'metric-name';

    assertionsResult.addResult({
      index: 0,
      metric,
      result: succeedingResult,
    });

    expect(assertionsResult.testResult()).toEqual({
      ...testResult,
      namedScores: {
        [metric]: 1,
      },
    });
  });

  it('handles result without tokensUsed', () => {
    const resultWithoutTokensUsed = {
      ...succeedingResult,
      tokensUsed: undefined,
    };

    assertionsResult.addResult({
      index: 0,
      result: resultWithoutTokensUsed,
    });

    expect(assertionsResult.testResult()).toEqual({
      ...testResult,
      componentResults: [resultWithoutTokensUsed],
      tokensUsed: { total: 0, prompt: 0, completion: 0 },
    });
  });

  it('respects succeeding threshold', () => {
    const threshold = 0.5;

    assertionsResult = new AssertionsResult({ threshold });

    assertionsResult.addResult({
      index: 0,
      result: succeedingResult,
    });

    expect(assertionsResult.testResult()).toEqual({
      ...testResult,
      reason: 'Aggregate score 1.00 ≥ 0.5 threshold',
    });
  });

  it('respects failing threshold', () => {
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

    expect(assertionsResult.testResult()).toEqual({
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

  describe('noAssertsResult', () => {
    it('returns correct value', () => {
      expect(AssertionsResult.noAssertsResult()).toEqual({
        pass: true,
        score: 1,
        reason: 'No assertions',
        tokensUsed: { total: 0, prompt: 0, completion: 0 },
        assertion: null,
      });
    });
  });
});
