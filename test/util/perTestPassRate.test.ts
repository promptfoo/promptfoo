import { describe, expect, it } from 'vitest';
import { type EvaluateResult, ResultFailureReason } from '../../src/types';
import { findTestsBelowRepeatPassRateThreshold } from '../../src/util/perTestPassRate';

type PartialResult = Pick<
  EvaluateResult,
  'promptIdx' | 'testIdx' | 'testCase' | 'vars' | 'success' | 'failureReason'
>;

function makeResult(overrides: Partial<PartialResult> & { success: boolean }): EvaluateResult {
  const base = {
    promptIdx: 0,
    testIdx: 0,
    testCase: { description: 'default' },
    vars: {},
    failureReason: overrides.success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
    score: overrides.success ? 1 : 0,
    namedScores: {},
    latencyMs: 0,
    promptId: 'p',
    prompt: { raw: '', label: '' } as EvaluateResult['prompt'],
    provider: { id: 'echo' },
  };
  return { ...base, ...overrides } as EvaluateResult;
}

describe('findTestsBelowRepeatPassRateThreshold', () => {
  it('returns an empty array when no results are given', () => {
    expect(findTestsBelowRepeatPassRateThreshold([], 80)).toEqual([]);
  });

  it('returns an empty array when threshold is NaN', () => {
    const results = [makeResult({ success: false }), makeResult({ success: false })];
    expect(findTestsBelowRepeatPassRateThreshold(results, Number.NaN)).toEqual([]);
  });

  it('groups repeats of the same logical test by description+vars+promptIdx', () => {
    const results: EvaluateResult[] = [
      makeResult({
        testIdx: 0,
        testCase: { description: 'A' },
        vars: { x: 1 },
        success: true,
      }),
      makeResult({
        testIdx: 1,
        testCase: { description: 'A' },
        vars: { x: 1 },
        success: true,
      }),
      makeResult({
        testIdx: 2,
        testCase: { description: 'A' },
        vars: { x: 1 },
        success: false,
      }),
    ];
    expect(findTestsBelowRepeatPassRateThreshold(results, 80)).toEqual([
      expect.objectContaining({
        description: 'A',
        passCount: 2,
        totalCount: 3,
      }),
    ]);
  });

  it('reports nothing when every group meets the threshold', () => {
    const make = (idx: number, success: boolean) =>
      makeResult({
        testIdx: idx,
        testCase: { description: 'A' },
        vars: { x: 1 },
        success,
      });
    // 4/5 = 80%, threshold 80 → not strictly below → no failures.
    const results = [make(0, true), make(1, true), make(2, true), make(3, true), make(4, false)];
    expect(findTestsBelowRepeatPassRateThreshold(results, 80)).toEqual([]);
  });

  it('treats different vars as separate groups', () => {
    const results: EvaluateResult[] = [
      makeResult({ testIdx: 0, vars: { x: 1 }, success: true }),
      makeResult({ testIdx: 1, vars: { x: 1 }, success: true }),
      makeResult({ testIdx: 2, vars: { x: 2 }, success: false }),
      makeResult({ testIdx: 3, vars: { x: 2 }, success: false }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 80);
    expect(failures).toHaveLength(1);
    expect(failures[0].passCount).toBe(0);
    expect(failures[0].totalCount).toBe(2);
  });

  it('treats different promptIdx as separate groups', () => {
    const results: EvaluateResult[] = [
      makeResult({ promptIdx: 0, success: true }),
      makeResult({ promptIdx: 0, success: true }),
      makeResult({ promptIdx: 1, success: false }),
      makeResult({ promptIdx: 1, success: false }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 50);
    expect(failures).toHaveLength(1);
    expect(failures[0].passRatePct).toBe(0);
  });

  it('counts errored results as non-passes', () => {
    const results: EvaluateResult[] = [
      makeResult({
        testIdx: 0,
        success: false,
        failureReason: ResultFailureReason.ERROR,
      }),
      makeResult({
        testIdx: 1,
        success: true,
        failureReason: ResultFailureReason.NONE,
      }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 80);
    expect(failures).toHaveLength(1);
    expect(failures[0].passCount).toBe(1);
    expect(failures[0].totalCount).toBe(2);
  });

  it('falls back to testCase.vars when top-level vars are missing (DB-loaded shape)', () => {
    const results = [
      {
        promptIdx: 0,
        testIdx: 0,
        testCase: { description: 'A', vars: { x: 1 } },
        success: true,
      },
      {
        promptIdx: 0,
        testIdx: 1,
        testCase: { description: 'A', vars: { x: 1 } },
        success: false,
      },
    ] as unknown as EvaluateResult[];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 80);
    expect(failures).toHaveLength(1);
    expect(failures[0].description).toBe('A');
  });

  it('handles var key ordering deterministically', () => {
    const results: EvaluateResult[] = [
      makeResult({ testIdx: 0, vars: { a: 1, b: 2 }, success: false }),
      makeResult({ testIdx: 1, vars: { b: 2, a: 1 }, success: false }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 50);
    expect(failures).toHaveLength(1);
    expect(failures[0].totalCount).toBe(2);
  });

  it('keeps tests with same vars but different assertions in separate groups', () => {
    // Pattern: two tests with no description, identical vars, but different
    // assertions. Without `assert` in the group key these merge and a
    // consistently failing test gets averaged out behind a passing one.
    const results = [
      {
        promptIdx: 0,
        testIdx: 0,
        testCase: { vars: { x: 1 }, assert: [{ type: 'contains', value: 'foo' }] },
        vars: { x: 1 },
        success: true,
      },
      {
        promptIdx: 0,
        testIdx: 1,
        testCase: { vars: { x: 1 }, assert: [{ type: 'contains', value: 'foo' }] },
        vars: { x: 1 },
        success: true,
      },
      {
        promptIdx: 0,
        testIdx: 2,
        testCase: { vars: { x: 1 }, assert: [{ type: 'contains', value: 'bar' }] },
        vars: { x: 1 },
        success: false,
      },
      {
        promptIdx: 0,
        testIdx: 3,
        testCase: { vars: { x: 1 }, assert: [{ type: 'contains', value: 'bar' }] },
        vars: { x: 1 },
        success: false,
      },
    ] as unknown as EvaluateResult[];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 80);
    expect(failures).toHaveLength(1);
    expect(failures[0].passCount).toBe(0);
    expect(failures[0].totalCount).toBe(2);
  });

  it('redacts var values from the failure description when no description is set', () => {
    const results: EvaluateResult[] = [
      makeResult({
        testIdx: 0,
        testCase: { vars: { api_key: 'sk-secret', user_email: 'a@b.com' } },
        vars: { api_key: 'sk-secret', user_email: 'a@b.com' },
        success: false,
      }),
      makeResult({
        testIdx: 1,
        testCase: { vars: { api_key: 'sk-secret', user_email: 'a@b.com' } },
        vars: { api_key: 'sk-secret', user_email: 'a@b.com' },
        success: false,
      }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 50);
    expect(failures).toHaveLength(1);
    expect(failures[0].description).not.toContain('sk-secret');
    expect(failures[0].description).not.toContain('a@b.com');
    expect(failures[0].description).toContain('api_key');
    expect(failures[0].description).toContain('user_email');
  });

  it('falls back to testIdx-only when there is no description and no vars', () => {
    const results: EvaluateResult[] = [
      makeResult({ testIdx: 7, testCase: {}, vars: {}, success: false }),
      makeResult({ testIdx: 7, testCase: {}, vars: {}, success: false }),
    ];
    const failures = findTestsBelowRepeatPassRateThreshold(results, 50);
    expect(failures).toHaveLength(1);
    expect(failures[0].description).toBe('test #7');
  });
});
