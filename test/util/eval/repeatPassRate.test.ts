import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../../src/types/index';
import { getFailingRepeatGroups } from '../../../src/util/eval/repeatPassRate';
import { calculateRepeatStability } from '../../../src/util/eval/repeatStability';

function result(repeatGroupId: string, repeatIndex: number, success: boolean, overrides = {}) {
  return {
    description: repeatGroupId,
    failureReason: success ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
    prompt: { label: 'prompt' },
    promptIdx: 0,
    provider: { id: 'echo' },
    repeatGroupId,
    repeatIndex,
    success,
    testCase: {},
    ...overrides,
  };
}

describe('getFailingRepeatGroups', () => {
  it('returns no groups without a summary', () => {
    expect(getFailingRepeatGroups(undefined, 50)).toEqual([]);
  });

  it('flags groups whose pass rate is below the threshold', () => {
    const summary = calculateRepeatStability([
      result('flaky', 0, true),
      result('flaky', 1, false),
      result('flaky', 2, false),
      result('stable', 0, true),
      result('stable', 1, true),
      result('stable', 2, true),
    ]);
    const failing = getFailingRepeatGroups(summary, 50);
    expect(failing.map((group) => group.repeatGroupId)).toEqual(['flaky']);
    expect(failing[0]).toMatchObject({ passed: 1, repetitions: 3 });
    expect(getFailingRepeatGroups(summary, 33)).toEqual([]);
  });

  it('counts errored repetitions as not passing', () => {
    const summary = calculateRepeatStability([
      result('errors', 0, true),
      result('errors', 1, false, { failureReason: ResultFailureReason.ERROR }),
    ]);
    expect(getFailingRepeatGroups(summary, 100).map((group) => group.repeatGroupId)).toEqual([
      'errors',
    ]);
  });

  it('keeps prompts and providers of the same test apart', () => {
    const summary = calculateRepeatStability([
      result('test', 0, true),
      result('test', 1, true),
      result('test', 0, false, { provider: { id: 'other' } }),
      result('test', 1, false, { provider: { id: 'other' } }),
    ]);
    const failing = getFailingRepeatGroups(summary, 100);
    expect(failing.map((group) => group.provider.id)).toEqual(['other']);
  });
});
