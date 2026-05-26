import { describe, expect, it } from 'vitest';
import {
  computeRepeatPassRateViolations,
  findRepeatPassRateViolations,
  formatRepeatPassRateViolation,
  REPEAT_PASS_RATE_GROUP_METADATA_KEY,
} from '../../src/util/repeatPassRateThreshold';

import type Eval from '../../src/models/eval';
import type { AtomicTestCase } from '../../src/types/index';

function makeResult(opts: {
  testIdx: number;
  promptIdx: number;
  success: boolean;
  repeatGroupTestIdx?: number;
  description?: string;
  testCase?: AtomicTestCase;
}) {
  return {
    testIdx: opts.testIdx,
    promptIdx: opts.promptIdx,
    success: opts.success,
    description: opts.description ?? null,
    testCase:
      opts.testCase ??
      (opts.repeatGroupTestIdx === undefined
        ? ({} as AtomicTestCase)
        : ({
            metadata: { [REPEAT_PASS_RATE_GROUP_METADATA_KEY]: opts.repeatGroupTestIdx },
          } as AtomicTestCase)),
  };
}

describe('computeRepeatPassRateViolations', () => {
  it('returns no violations when all groups meet the threshold', () => {
    const results = [
      makeResult({ testIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 1, promptIdx: 0, success: true }),
      makeResult({ testIdx: 1, promptIdx: 0, success: false }),
    ];

    expect(computeRepeatPassRateViolations(results, 50)).toEqual([]);
  });

  it('flags a group whose repeat pass rate is below the threshold', () => {
    const results = [
      // testIdx 0: 8/10 pass = 80% (above 80%, but threshold is strict <, so OK)
      ...Array.from({ length: 8 }, () => makeResult({ testIdx: 0, promptIdx: 0, success: true })),
      ...Array.from({ length: 2 }, () => makeResult({ testIdx: 0, promptIdx: 0, success: false })),
      // testIdx 1: 7/10 pass = 70% (below 80%, should flag)
      ...Array.from({ length: 7 }, () => makeResult({ testIdx: 1, promptIdx: 0, success: true })),
      ...Array.from({ length: 3 }, () => makeResult({ testIdx: 1, promptIdx: 0, success: false })),
    ];

    const violations = computeRepeatPassRateViolations(results, 80);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      testIdx: 1,
      promptIdx: 0,
      successes: 7,
      total: 10,
      passRate: 70,
    });
  });

  it('treats errors as non-passes (matching aggregate PROMPTFOO_PASS_RATE_THRESHOLD semantics)', () => {
    // Mix of failures and errors should both count against the pass rate.
    const results = [
      makeResult({ testIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 0, promptIdx: 0, success: false }), // assertion failure
      makeResult({ testIdx: 0, promptIdx: 0, success: false }), // error
    ];

    const violations = computeRepeatPassRateViolations(results, 80);
    expect(violations).toEqual([
      {
        testIdx: 0,
        promptIdx: 0,
        successes: 1,
        total: 3,
        passRate: (1 / 3) * 100,
        description: undefined,
      },
    ]);
  });

  it('groups repeats independently per (testIdx, promptIdx)', () => {
    const results = [
      // testIdx 0 + promptIdx 0: 1/2 = 50%
      makeResult({ testIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 0, promptIdx: 0, success: false }),
      // testIdx 0 + promptIdx 1: 2/2 = 100%
      makeResult({ testIdx: 0, promptIdx: 1, success: true }),
      makeResult({ testIdx: 0, promptIdx: 1, success: true }),
      // testIdx 1 + promptIdx 0: 0/2 = 0%
      makeResult({ testIdx: 1, promptIdx: 0, success: false }),
      makeResult({ testIdx: 1, promptIdx: 0, success: false }),
    ];

    const violations = computeRepeatPassRateViolations(results, 80);
    expect(violations.map((v) => `${v.testIdx}:${v.promptIdx}=${v.passRate}`)).toEqual([
      '0:0=50',
      '1:0=0',
    ]);
  });

  it('groups evaluator rows by stable repeat identity when display test indices change', () => {
    const results = [
      makeResult({ testIdx: 0, repeatGroupTestIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 1, repeatGroupTestIdx: 0, promptIdx: 0, success: false }),
      makeResult({ testIdx: 2, repeatGroupTestIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 3, repeatGroupTestIdx: 0, promptIdx: 0, success: true }),
      makeResult({ testIdx: 4, repeatGroupTestIdx: 0, promptIdx: 0, success: true }),
    ];

    expect(computeRepeatPassRateViolations(results, 80)).toEqual([]);
    expect(computeRepeatPassRateViolations(results, 81)).toMatchObject([
      {
        testIdx: 0,
        promptIdx: 0,
        successes: 4,
        total: 5,
        passRate: 80,
      },
    ]);
  });

  it('uses the test case description when available', () => {
    const results = [
      makeResult({
        testIdx: 0,
        promptIdx: 0,
        success: false,
        testCase: { description: 'Refund flow' } as AtomicTestCase,
      }),
    ];

    const violations = computeRepeatPassRateViolations(results, 100);
    expect(violations[0].description).toBe('Refund flow');
  });

  it('prefers a per-result description over the test case description', () => {
    const results = [
      makeResult({
        testIdx: 0,
        promptIdx: 0,
        success: false,
        description: 'Per-result label',
        testCase: { description: 'TestCase label' } as AtomicTestCase,
      }),
    ];

    const violations = computeRepeatPassRateViolations(results, 100);
    expect(violations[0].description).toBe('Per-result label');
  });

  it('returns no violations when the threshold is not finite', () => {
    const results = [makeResult({ testIdx: 0, promptIdx: 0, success: false })];

    expect(computeRepeatPassRateViolations(results, Number.NaN)).toEqual([]);
    expect(computeRepeatPassRateViolations(results, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('sorts violations by (testIdx, promptIdx) for deterministic output', () => {
    const results = [
      // Intentionally out of order to verify sorting.
      makeResult({ testIdx: 2, promptIdx: 0, success: false }),
      makeResult({ testIdx: 0, promptIdx: 1, success: false }),
      makeResult({ testIdx: 0, promptIdx: 0, success: false }),
      makeResult({ testIdx: 1, promptIdx: 0, success: false }),
    ];

    const violations = computeRepeatPassRateViolations(results, 100);
    expect(violations.map((v) => [v.testIdx, v.promptIdx])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ]);
  });

  it('computes a violation for a single supplied failing result', () => {
    const violations = computeRepeatPassRateViolations(
      [makeResult({ testIdx: 0, promptIdx: 0, success: false })],
      100,
    );

    expect(violations).toEqual([
      {
        testIdx: 0,
        promptIdx: 0,
        successes: 0,
        total: 1,
        passRate: 0,
        description: undefined,
      },
    ]);
  });
});

describe('findRepeatPassRateViolations', () => {
  it('returns no violations when the threshold is not finite', async () => {
    const evalRecord = {
      persisted: false,
      results: [makeResult({ testIdx: 0, promptIdx: 0, success: false })],
    } as unknown as Eval;

    expect(await findRepeatPassRateViolations(evalRecord, Number.NaN)).toEqual([]);
    expect(await findRepeatPassRateViolations(evalRecord, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('delegates to computeRepeatPassRateViolations for in-memory evals', async () => {
    const evalRecord = {
      persisted: false,
      results: [
        makeResult({ testIdx: 0, promptIdx: 0, success: true }),
        makeResult({ testIdx: 0, promptIdx: 0, success: false }),
        makeResult({ testIdx: 0, promptIdx: 0, success: false }),
      ],
    } as unknown as Eval;

    const violations = await findRepeatPassRateViolations(evalRecord, 80);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      testIdx: 0,
      promptIdx: 0,
      successes: 1,
      total: 3,
    });
  });

  it('streams batched results for persisted evals', async () => {
    async function* fetchResultsBatched() {
      yield [
        makeResult({ testIdx: 0, repeatGroupTestIdx: 0, promptIdx: 0, success: true }),
        makeResult({ testIdx: 1, repeatGroupTestIdx: 0, promptIdx: 0, success: false }),
      ];
      yield [
        makeResult({ testIdx: 2, repeatGroupTestIdx: 0, promptIdx: 0, success: false }),
        makeResult({
          testIdx: 3,
          repeatGroupTestIdx: 3,
          promptIdx: 0,
          success: true,
          description: 'OK test',
        }),
      ];
    }
    const evalRecord = {
      persisted: true,
      fetchResultsBatched,
    } as unknown as Eval;

    const violations = await findRepeatPassRateViolations(evalRecord, 80);
    expect(violations).toEqual([
      {
        testIdx: 0,
        promptIdx: 0,
        successes: 1,
        total: 3,
        passRate: (1 / 3) * 100,
        description: undefined,
      },
    ]);
  });

  it('preserves descriptions when streaming persisted results', async () => {
    async function* fetchResultsBatched() {
      yield [
        makeResult({
          testIdx: 5,
          promptIdx: 2,
          success: false,
          description: 'Tax calculation',
        }),
        makeResult({ testIdx: 5, promptIdx: 2, success: false }),
      ];
    }
    const evalRecord = {
      persisted: true,
      fetchResultsBatched,
    } as unknown as Eval;

    const violations = await findRepeatPassRateViolations(evalRecord, 100);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      testIdx: 5,
      promptIdx: 2,
      description: 'Tax calculation',
    });
  });

  it('returns no violations when persisted results are empty', async () => {
    async function* fetchResultsBatched() {
      // No yields
    }
    const evalRecord = {
      persisted: true,
      fetchResultsBatched,
    } as unknown as Eval;

    expect(await findRepeatPassRateViolations(evalRecord, 80)).toEqual([]);
  });

  it('sorts violations deterministically for persisted evals too', async () => {
    async function* fetchResultsBatched() {
      yield [
        makeResult({ testIdx: 2, promptIdx: 0, success: false }),
        makeResult({ testIdx: 0, promptIdx: 1, success: false }),
        makeResult({ testIdx: 0, promptIdx: 0, success: false }),
        makeResult({ testIdx: 1, promptIdx: 0, success: false }),
      ];
    }
    const evalRecord = {
      persisted: true,
      fetchResultsBatched,
    } as unknown as Eval;

    const violations = await findRepeatPassRateViolations(evalRecord, 100);
    expect(violations.map((v) => [v.testIdx, v.promptIdx])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ]);
  });
});

describe('formatRepeatPassRateViolation', () => {
  it('includes the description when present', () => {
    expect(
      formatRepeatPassRateViolation(
        {
          testIdx: 3,
          promptIdx: 1,
          successes: 6,
          total: 10,
          passRate: 60,
          description: 'Refund flow',
        },
        80,
      ),
    ).toBe('test #3 (Refund flow), prompt #1: 6/10 passed (60.00% < 80%)');
  });

  it('omits the description when absent', () => {
    expect(
      formatRepeatPassRateViolation(
        {
          testIdx: 0,
          promptIdx: 0,
          successes: 0,
          total: 5,
          passRate: 0,
        },
        50,
      ),
    ).toBe('test #0, prompt #0: 0/5 passed (0.00% < 50%)');
  });
});
