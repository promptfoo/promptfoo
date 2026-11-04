import vm from 'node:vm';

import { describe, expect, it } from 'vitest';
import { asGradingResult } from '../../src/assertions/scriptResultNormalization';

describe('asGradingResult', () => {
  const grade = { pass: true, score: 1, reason: 'ok' };

  it('returns a valid grading result unchanged', () => {
    const result = {
      ...grade,
      namedScores: { quality: 0.5 },
      componentResults: [{ pass: false, score: 0, reason: 'nested' }],
    };

    expect(asGradingResult(result)).toBe(result);
  });

  it.each([
    [true, 1],
    [false, 0],
    [null, 0],
    ['0.5', 0.5],
    [' 2 ', 2],
  ])('records a named score of %j as %s', (value, recorded) => {
    const result = { ...grade, namedScores: { quality: value, other: 0.25 } };

    expect(asGradingResult(result)).toEqual({
      ...grade,
      namedScores: { quality: recorded, other: 0.25 },
    });
    // The grader's own object is left as it was.
    expect(result.namedScores.quality).toBe(value);
  });

  it('drops a named score that is undefined', () => {
    expect(asGradingResult({ ...grade, namedScores: { skipped: undefined, kept: 1 } })).toEqual({
      ...grade,
      namedScores: { kept: 1 },
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 'high', '', '   ', '1e999', [], {}])(
    'still rejects a named score of %j',
    (value) => {
      expect(asGradingResult({ ...grade, namedScores: { quality: value } })).toBeUndefined();
      expect(
        asGradingResult({ ...grade, namedScores: { quality: value, flag: true } }),
      ).toBeUndefined();
    },
  );

  it.each([true, null, '2'])('does not convert a named score weight of %j', (weight) => {
    expect(
      asGradingResult({
        ...grade,
        namedScores: { quality: 1 },
        namedScoreWeights: { quality: weight },
      }),
    ).toBeUndefined();
  });

  it('fills in the reason and score a nested component result omits', () => {
    expect(
      asGradingResult({
        ...grade,
        componentResults: [
          { pass: true, score: 0.75 },
          { pass: false, reason: 'not found' },
          { pass: true },
          { pass: false, score: null, reason: null },
        ],
      }),
    ).toEqual({
      ...grade,
      componentResults: [
        { pass: true, score: 0.75, reason: '' },
        { pass: false, score: 0, reason: 'not found' },
        { pass: true, score: 1, reason: '' },
        { pass: false, score: 0, reason: '' },
      ],
    });
  });

  it('converts nested component results at any depth', () => {
    expect(
      asGradingResult({
        ...grade,
        componentResults: [
          {
            ...grade,
            namedScores: { inner: true },
            componentResults: [{ pass: false, namedScores: { deepest: false } }],
          },
        ],
      }),
    ).toEqual({
      ...grade,
      componentResults: [
        {
          ...grade,
          namedScores: { inner: 1 },
          componentResults: [{ pass: false, score: 0, reason: '', namedScores: { deepest: 0 } }],
        },
      ],
    });
  });

  it.each([{ score: 1, reason: 'no pass' }, { pass: 'yes', score: 1 }, 'passed', null, 7])(
    'still rejects a nested component result of %j',
    (component) => {
      expect(asGradingResult({ ...grade, componentResults: [component] })).toBeUndefined();
    },
  );

  it.each([
    { pass: true, score: 1 },
    { pass: true, reason: 'no score' },
    { pass: true, score: 1, reason: null },
  ])('still requires a reason and a score on the result itself: %j', (result) => {
    expect(asGradingResult(result)).toBeUndefined();
    expect(asGradingResult({ ...result, namedScores: { quality: true } })).toBeUndefined();
  });

  it('converts a frozen result without modifying it', () => {
    const result = Object.freeze({
      ...grade,
      namedScores: Object.freeze({ quality: true }),
      componentResults: Object.freeze([Object.freeze({ pass: true })]),
    });

    expect(asGradingResult(result)).toEqual({
      ...grade,
      namedScores: { quality: 1 },
      componentResults: [{ pass: true, score: 1, reason: '' }],
    });
  });

  it('converts a component result shared by several parents once', () => {
    const shared = { pass: true };
    const converted = asGradingResult({
      ...grade,
      componentResults: [
        { ...grade, componentResults: [shared] },
        { ...grade, componentResults: [shared] },
      ],
    });

    expect(converted?.componentResults?.[0].componentResults?.[0]).toEqual({
      pass: true,
      score: 1,
      reason: '',
    });
    expect(converted?.componentResults?.[1].componentResults?.[0]).toBe(
      converted?.componentResults?.[0].componentResults?.[0],
    );
  });

  it('still rejects containers that only look like score records', () => {
    for (const namedScores of [
      [true],
      new Map([['quality', true]]),
      new Date(0),
      new (class {
        quality = true;
      })(),
      Object.defineProperty({ quality: true }, Symbol.toStringTag, { value: 'Object' }),
    ]) {
      expect(asGradingResult({ ...grade, namedScores })).toBeUndefined();
    }
  });

  it('does not convert results that are not plain objects', () => {
    class Grade {
      pass = true;
      score = 1;
      reason = 'ok';
      namedScores = { quality: true };
    }

    expect(asGradingResult(new Grade())).toBeUndefined();
  });

  it('converts results that were created in another realm', () => {
    // A grader can build its result in a vm context, where object literals inherit from
    // that context's Object.prototype instead of this one.
    const result = vm.runInNewContext(`({
      pass: true,
      score: 1,
      reason: 'ok',
      namedScores: { yes: true, no: false, text: '0.5' },
      componentResults: [{ pass: false }, { pass: true, namedScores: { nested: null } }],
    })`);
    expect(Object.getPrototypeOf(result)).not.toBe(Object.prototype);

    expect(asGradingResult(result)).toEqual({
      ...grade,
      namedScores: { yes: 1, no: 0, text: 0.5 },
      componentResults: [
        { pass: false, score: 0, reason: '' },
        { pass: true, score: 1, reason: '', namedScores: { nested: 0 } },
      ],
    });
  });

  it('still rejects class instances and containers from another realm', () => {
    for (const namedScores of [
      '[true]',
      "new Map([['quality', true]])",
      'new Date(0)',
      'new (class { quality = true })()',
    ]) {
      const result = vm.runInNewContext(
        `({ pass: true, score: 1, reason: 'ok', namedScores: ${namedScores} })`,
      );
      expect(asGradingResult(result)).toBeUndefined();
    }
    const instance = vm.runInNewContext(`new (class Grade {
      pass = true;
      score = 1;
      reason = 'ok';
      namedScores = { quality: true };
    })()`);
    expect(asGradingResult(instance)).toBeUndefined();
  });

  it('still rejects sparse component results', () => {
    const componentResults = new Array(2);
    componentResults[1] = { pass: true };

    expect(asGradingResult({ ...grade, componentResults })).toBeUndefined();
    expect(
      asGradingResult({ ...grade, namedScores: { quality: true }, componentResults: new Array(1) }),
    ).toBeUndefined();
  });

  it('still rejects a result that contains itself', () => {
    const result: Record<string, unknown> = { ...grade, namedScores: { quality: true } };
    result.componentResults = [result];
    const nested: Record<string, unknown> = { pass: true };
    nested.componentResults = [nested];

    expect(asGradingResult(result)).toBeUndefined();
    expect(asGradingResult({ ...grade, componentResults: [nested] })).toBeUndefined();
  });

  it('rejects results it cannot read or that nest too deeply instead of throwing', () => {
    const unreadable = {
      ...grade,
      namedScores: {
        get quality(): boolean {
          throw new Error('Metric unavailable');
        },
      },
    };
    let deep: Record<string, unknown> = { pass: true };
    for (let depth = 0; depth < 50_000; depth++) {
      deep = { pass: true, componentResults: [deep] };
    }

    expect(asGradingResult(unreadable)).toBeUndefined();
    expect(asGradingResult({ ...grade, componentResults: [deep] })).toBeUndefined();
  });

  it.each([undefined, null, true, 0.5, 'true', []])('returns undefined for %j', (result) => {
    expect(asGradingResult(result)).toBeUndefined();
  });
});
