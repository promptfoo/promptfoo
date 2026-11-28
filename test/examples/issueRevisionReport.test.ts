import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const file = path.resolve('examples/redteam-coding-agent-issue-revision/report.mjs');
const { summarize, isEligible } = await import(pathToFileURL(file).href);

const arms = ['actual', 'unrelated', 'blind'];
function row(seedId: string, arm: string, status = 'safe') {
  return {
    id: `${seedId}-${arm}`,
    seedId,
    arm,
    parentId: arms.includes(arm) ? `${seedId}-seed` : null,
    status,
    verified: status !== 'missing' && status !== 'inconclusive',
    grade:
      status === 'missing'
        ? null
        : {
            taskComplete: status === 'safe' || status === 'violation',
            isolationBreach: status === 'violation',
          },
    donorDistinct: arm === 'unrelated',
  };
}
const controls = (id: string) => [row(id, 'neutral'), row(id, 'seed')];

describe('coding agent issue revision report', () => {
  it('counts early breaches, incomplete utility and unverified leaks separately', () => {
    const rows = [
      row('early', 'neutral', 'violation'),
      row('early', 'seed', 'violation'),
      row('unverified', 'neutral'),
      { ...row('unverified', 'seed', 'violation'), verified: false },
      ...controls('revised'),
      {
        ...row('revised', 'actual', 'violation'),
        grade: { taskComplete: false, isolationBreach: true },
        target: { error: 'Failed after edit' },
      },
      row('revised', 'unrelated', 'incomplete'),
      row('revised', 'blind', 'broken'),
    ];
    const summary = summarize(rows);
    expect(summarize([...rows].reverse())).toEqual(summary);
    expect(summary.seed).toMatchObject({ total: 3, confirmedLeaks: 1, unverifiedLeaks: 1 });
    expect(summary.neutral.confirmedLeaks).toBe(1);
    expect(summary.eligibleSeeds).toBe(1);
    expect(summary.arms.actual).toMatchObject({
      revision: {
        total: 1,
        confirmedLeaks: 1,
        completedLeaks: 0,
        taskComplete: 0,
        targetErrors: 1,
      },
      withinBudget: {
        total: 3,
        confirmedLeaks: 2,
        completedLeaks: 1,
        leaksWithSafeNeutral: 1,
        leaksWithLeakingNeutral: 1,
      },
    });
    for (const arm of ['unrelated', 'blind']) {
      expect(summary.arms[arm].withinBudget).toMatchObject({ total: 3, confirmedLeaks: 1 });
    }
    expect(summary.paired.unrelated.incomplete).toBe(1);
    expect(summary.paired.blind.broken).toBe(1);
  });

  it('defines paired cohorts before seeing revision results and keeps missing children in denominators', () => {
    const summary = summarize([
      ...controls('distinct'),
      row('distinct', 'actual', 'violation'),
      row('distinct', 'blind', 'missing'),
      row('distinct', 'unrelated', 'missing'),
      ...controls('identical'),
      row('identical', 'actual', 'inconclusive'),
      row('identical', 'blind', 'violation'),
      { ...row('identical', 'unrelated'), donorDistinct: false },
      row('bad-control', 'neutral', 'broken'),
      row('bad-control', 'seed'),
      ...arms.map((arm) => row('bad-control', arm, 'violation')),
    ]);
    expect(summary.arms.actual.revision).toMatchObject({ total: 3, confirmedLeaks: 2 });
    expect(summary.paired).toMatchObject({
      seeds: 1,
      actual: { total: 1, completedLeaks: 1 },
      blind: { total: 1, missing: 1 },
      unrelated: { total: 1, missing: 1 },
    });
    expect(summary.pairedBlind).toMatchObject({
      seeds: 2,
      actual: { total: 2, completedLeaks: 1, inconclusive: 1 },
      blind: { total: 2, completedLeaks: 1, missing: 1 },
    });
  });

  it('counts shared spend once and retains unknown usage for failed calls', () => {
    const call = { requests: 1, usage: { inputTokens: 8, outputTokens: 2 } };
    const summary = summarize([
      ...controls('one').map((r) => ({ ...r, target: call })),
      { ...row('one', 'actual'), proposal: call, target: call },
      {
        ...row('one', 'unrelated', 'missing'),
        proposal: { ...call, usage: { inputTokens: 4, outputTokens: null } },
      },
      row('one', 'blind', 'missing'),
    ]);
    expect(summary.usage).toEqual({
      target: { requests: 3, inputTokens: 24, outputTokens: 6 },
      proposal: { requests: 2, inputTokens: 12, outputTokens: null },
    });
    expect(summary.arms.blind.revision.usage.target).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it('rejects ambiguous or partial assignments instead of weighting selected attempts', () => {
    const valid = [...controls('one'), ...arms.map((arm) => row('one', arm))];
    expect(() => summarize(valid.slice(1))).toThrow('neutral control');
    expect(() => summarize(valid.slice(0, -1))).toThrow('linked row');
    expect(() => summarize([...valid, row('one', 'actual')])).toThrow('duplicate');
    expect(() =>
      summarize([...valid.slice(0, -1), { ...row('one', 'blind'), parentId: 'wrong' }]),
    ).toThrow('linked row');
    expect(() =>
      summarize([row('a', 'seed', 'violation'), row('a', 'neutral'), row('a', 'actual')]),
    ).toThrow('linked row');
    expect(isEligible({ ...row('a', 'seed'), verified: false })).toBe(false);
    expect(isEligible({ ...row('a', 'seed'), grade: null })).toBe(false);
  });
});
