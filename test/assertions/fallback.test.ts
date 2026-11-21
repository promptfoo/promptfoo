import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { validateAssertions } from '../../src/assertions/validateAssertions';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, Assertion, AssertionOrSet, TestCase } from '../../src/types/index';

describe('deterministic assertion fallbacks', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES: 'false',
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  function grade(assert: AssertionOrSet[], output = 'fixture') {
    return runAssertions({ test: { assert }, providerResponse: { output }, prompt: 'Fixture' });
  }

  function modelGrade(pass = true, score = 0.75) {
    const callApi = vi.fn<ApiProvider['callApi']>(async () => ({
      output: JSON.stringify({ pass, score, reason: 'Local grade' }),
      tokenUsage: { total: 7, prompt: 5, completion: 2, numRequests: 1 },
    }));
    const assertion: Assertion = {
      type: 'llm-rubric',
      value: 'A fixture response',
      metric: 'Model',
      weight: 2,
      provider: { id: () => 'fixture-grader', callApi },
    };
    return { callApi, assertion };
  }

  it('stops on a passing cheap check and keeps independent assertions', async () => {
    const { callApi, assertion } = modelGrade();
    const result = await grade([
      { type: 'equals', value: 'fixture', fallback: 'next', metric: 'Cheap' },
      assertion,
      { type: 'contains', value: 'fix', metric: 'Separate' },
    ]);
    expect(callApi).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pass: true, score: 1, namedScores: { Cheap: 1, Separate: 1 } });
    expect(result.componentResults).toHaveLength(2);
    expect(result.tokensUsed?.numRequests).toBe(0);
  });

  it('scores and accounts only for the last reached check in a chain', async () => {
    const { callApi, assertion } = modelGrade();
    const result = await grade([
      { type: 'equals', value: 'other', fallback: 'next', metric: 'Cheap', weight: 99 },
      { type: 'contains', value: 'missing', fallback: 'next', metric: 'Second' },
      assertion,
      { type: 'equals', value: 'fixture', metric: 'Separate', weight: 1 },
    ]);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      pass: true,
      namedScores: { Model: 0.75, Separate: 1 },
      namedScoreWeights: { Model: 2, Separate: 1 },
      tokensUsed: { total: 7, prompt: 5, completion: 2, numRequests: 1 },
    });
    expect(result.score).toBeCloseTo(2.5 / 3);
    expect(result.componentResults).toHaveLength(2);
    expect(result.componentResults?.[0].metadata?.fallbackFailures).toEqual([
      { type: 'equals', reason: expect.stringContaining('other') },
      { type: 'contains', reason: expect.stringContaining('missing') },
    ]);
  });

  it('keeps chains inside assertion sets and preserves set weighting', async () => {
    const result = await grade([
      {
        type: 'assert-set',
        weight: 2,
        metric: 'Set',
        assert: [
          { type: 'equals', value: 'other', fallback: 'next' },
          { type: 'equals', value: 'fixture' },
        ],
      },
      { type: 'equals', value: 'other', weight: 1 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(2 / 3);
    expect(result.namedScores).toEqual({ Set: 1 });
    expect(result.componentResults?.filter((item) => item.metadata?.fallbackFailures)).toHaveLength(
      1,
    );
  });

  it.each(['contains', 'icontains', 'starts-with', 'not-equals'] as const)(
    'supports %s as a deterministic source',
    async (type) => {
      const { callApi, assertion } = modelGrade();
      const result = await grade([
        { type, value: type === 'not-equals' ? 'other' : 'fix', fallback: 'next' },
        assertion,
      ]);
      expect(result.pass).toBe(true);
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it('preserves a failed terminal grade', async () => {
    const { callApi, assertion } = modelGrade(false, 0.2);
    const result = await grade([{ type: 'equals', value: 'other', fallback: 'next' }, assertion]);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ pass: false, score: 0.2, reason: 'Local grade' });
    expect(result.componentResults).toHaveLength(1);
  });

  it('does not fall through a source execution error', async () => {
    const { callApi, assertion } = modelGrade();
    await expect(
      grade([{ type: 'contains', value: '{{missing}}', fallback: 'next' }, assertion]),
    ).rejects.toThrow('must have a string or number');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('preserves terminal provider errors without trying another check', async () => {
    const { callApi, assertion } = modelGrade();
    callApi.mockRejectedValue(new Error('Local grader unavailable'));
    await expect(
      grade([{ type: 'equals', value: 'other', fallback: 'next' }, assertion]),
    ).rejects.toThrow('Local grader unavailable');
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  describe('short-circuit mode', () => {
    it('allows an ordinary mismatch to reach its fallback', async () => {
      mockProcessEnv({ PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES: 'true' });
      const result = await grade([
        { type: 'equals', value: 'other', fallback: 'next' },
        { type: 'equals', value: 'fixture' },
      ]);
      expect(result.pass).toBe(true);
    });
  });
});

describe('fallback configuration validation', () => {
  const end: Assertion = { type: 'equals', value: 'fixture' };
  const start: Assertion = { ...end, fallback: 'next' };

  it.each([
    { type: 'javascript', value: 'true', fallback: 'next' },
    { ...start, fallback: true },
    { ...start, value: 'file://fixture.js' },
    { ...start, value: 'package:fixture:check' },
    { ...start, value: () => true },
    { ...start, value: ['fixture'] },
    { ...start, transform: 'output' },
    { ...start, contextTransform: 'output' },
    { ...start, weight: 0 },
    { ...start, weight: -1 },
    { ...start, weight: Infinity },
    { ...start, type: 'starts-with', value: 1 },
    { ...start, type: 'contains', value: '' },
  ])('rejects an unsupported source %j', (source) => {
    expect(() => validateAssertions([{ assert: [source as Assertion, end] }])).toThrow();
  });

  it.each(['assert-set', 'select-best', 'max-score', 'guardrails', 'custom-grader'])(
    'rejects unsupported target %s',
    (type) => {
      const target = { type, assert: [end] } as AssertionOrSet;
      expect(() => validateAssertions([{ assert: [start, target] }])).toThrow(
        'following ordinary assertion',
      );
    },
  );

  it('rejects dangling chains before default and scenario lists are combined', () => {
    expect(() => validateAssertions([{ assert: [end] }], { assert: [start] })).toThrow(
      'defaultTest.assert[0]',
    );
    expect(() => validateAssertions([{ assert: [start] }], { assert: [end] })).toThrow(
      'tests[0].assert[0]',
    );
    expect(() =>
      validateAssertions([], undefined, [
        { config: [{ assert: [start] }], tests: [{ assert: [end] }] },
      ]),
    ).toThrow('scenarios[0].config[0].assert[0]');
    expect(() =>
      validateAssertions([], undefined, [
        { config: [{ assert: [end] }], tests: [{ assert: [start] }] },
      ]),
    ).toThrow('scenarios[0].tests[0].assert[0]');
  });

  it('rejects a fallback marker on the assertion set itself', () => {
    const test = { assert: [{ type: 'assert-set', fallback: 'next', assert: [end] }, end] };
    expect(() => validateAssertions([test as TestCase])).toThrow('assert-set cannot start');
  });
});
