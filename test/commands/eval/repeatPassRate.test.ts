import { describe, expect, it } from 'vitest';
import { getFailingGroups, groupResultsByTest } from '../../../src/commands/eval/repeatPassRate';
import { ResultFailureReason } from '../../../src/types/index';

import type { EvaluateResult } from '../../../src/types/index';

function makeResult(overrides: Partial<EvaluateResult> & { success: boolean }): EvaluateResult {
  const { success, ...rest } = overrides;
  return {
    promptIdx: 0,
    testIdx: 0,
    testCase: { description: 'test A' },
    promptId: 'prompt-1',
    provider: { id: 'openai:gpt-4' },
    prompt: { raw: 'test', label: 'test', id: 'prompt-1' },
    vars: {},
    success,
    score: success ? 1 : 0,
    latencyMs: 100,
    namedScores: {},
    failureReason: ResultFailureReason.NONE,
    ...rest,
  };
}

describe('groupResultsByTest', () => {
  it('groups results by test description, promptId, and provider', () => {
    const results = [
      makeResult({ testIdx: 0, success: true, testCase: { description: 'test A' } }),
      makeResult({ testIdx: 1, success: false, testCase: { description: 'test A' } }),
      makeResult({ testIdx: 2, success: true, testCase: { description: 'test B' } }),
      makeResult({ testIdx: 3, success: true, testCase: { description: 'test B' } }),
    ];

    const groups = groupResultsByTest(results);
    expect(groups.size).toBe(2);

    const groupA = [...groups.values()].find((g) => g.description === 'test A')!;
    expect(groupA.pass).toBe(1);
    expect(groupA.total).toBe(2);

    const groupB = [...groups.values()].find((g) => g.description === 'test B')!;
    expect(groupB.pass).toBe(2);
    expect(groupB.total).toBe(2);
  });

  it('separates groups by provider', () => {
    const results = [
      makeResult({ success: true, provider: { id: 'openai:gpt-4' } }),
      makeResult({ success: false, provider: { id: 'anthropic:claude' } }),
    ];

    const groups = groupResultsByTest(results);
    expect(groups.size).toBe(2);
  });

  it('separates groups by promptId', () => {
    const results = [
      makeResult({ success: true, promptId: 'prompt-1' }),
      makeResult({ success: false, promptId: 'prompt-2' }),
    ];

    const groups = groupResultsByTest(results);
    expect(groups.size).toBe(2);
  });

  it('uses vars as fallback description when description is missing', () => {
    const results = [
      makeResult({ success: true, testCase: { vars: { input: 'hello' } } }),
      makeResult({ success: false, testCase: { vars: { input: 'hello' } } }),
    ];

    const groups = groupResultsByTest(results);
    expect(groups.size).toBe(1);
    const group = [...groups.values()][0];
    expect(group.description).toBe(JSON.stringify({ input: 'hello' }));
    expect(group.pass).toBe(1);
    expect(group.total).toBe(2);
  });
});

describe('getFailingGroups', () => {
  it('returns groups below threshold', () => {
    const groups = new Map([
      ['a', { description: 'test A', pass: 8, total: 10 }],
      ['b', { description: 'test B', pass: 5, total: 10 }],
      ['c', { description: 'test C', pass: 10, total: 10 }],
    ]);

    const failing = getFailingGroups(groups, 80);
    expect(failing).toHaveLength(1);
    expect(failing[0].description).toBe('test B');
  });

  it('returns empty array when all groups pass', () => {
    const groups = new Map([
      ['a', { description: 'test A', pass: 9, total: 10 }],
      ['b', { description: 'test B', pass: 8, total: 10 }],
    ]);

    const failing = getFailingGroups(groups, 80);
    expect(failing).toHaveLength(0);
  });

  it('treats exact threshold as passing', () => {
    const groups = new Map([['a', { description: 'test A', pass: 8, total: 10 }]]);

    const failing = getFailingGroups(groups, 80);
    expect(failing).toHaveLength(0);
  });

  it('treats just below threshold as failing', () => {
    const groups = new Map([['a', { description: 'test A', pass: 7, total: 10 }]]);

    const failing = getFailingGroups(groups, 80);
    expect(failing).toHaveLength(1);
  });
});
