import { beforeAll, describe, expect, it } from 'vitest';
import { runDbMigrations } from '../../src/migrate';
import { createEvaluateResult } from '../factories/eval';
import EvalFactory from '../factories/evalFactory';

import type { EvalResultsFilterMode, EvaluateResult } from '../../src/types/index';

describe('table search and filtered metrics', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  const fieldCases: [string, Partial<EvaluateResult>][] = [
    ['response', { response: { output: 'needle' } }],
    ['grading reason', { gradingResult: { pass: true, score: 1, reason: 'needle' } }],
    [
      'grading comment',
      { gradingResult: { pass: true, score: 1, reason: 'ok', comment: 'needle' } },
    ],
    ['named score', { namedScores: { needle: 1, marker: 1 } }],
    ['result metadata', { metadata: { note: 'needle' } }],
    ['variables', { testCase: { vars: { input: 'needle' } } }],
    ['test metadata', { testCase: { vars: { input: 'plain' }, metadata: { note: 'needle' } } }],
  ];

  async function create(patches: Partial<EvaluateResult>[]) {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    for (const [index, patch] of patches.entries()) {
      await eval_.addResult(
        createEvaluateResult({
          testIdx: index,
          promptIdx: 0,
          testCase: { vars: { input: 'plain' } },
          vars: { input: 'plain' },
          response: { output: 'plain' },
          metadata: {},
          namedScores: { marker: 1 },
          ...patch,
        }),
      );
    }
    return eval_;
  }

  it.each(fieldCases)(
    'searches %s consistently with and without a structured filter',
    async (_name, patch) => {
      const eval_ = await create([patch, {}]);
      const searchQuery = 'needle';
      const page = await eval_.getTablePage({ searchQuery });
      const filtered = await eval_.getTablePage({
        searchQuery,
        filters: [JSON.stringify({ type: 'metric', field: 'marker', operator: 'gte', value: 0 })],
      });
      const metrics = await eval_.getFilteredMetrics({ searchQuery });
      expect(page.filteredCount).toBe(1);
      expect(page.body.map((row) => row.testIdx)).toEqual([0]);
      expect(filtered.body.map((row) => row.testIdx)).toEqual([0]);
      expect(filtered.filteredCount).toBe(page.filteredCount);
      expect(
        metrics.reduce((n, m) => n + m.testPassCount + m.testFailCount + m.testErrorCount, 0),
      ).toBe(1);
      expect(page.totalCount).toBe(2);
    },
  );

  it.each([
    'all',
    'passes',
    'failures',
    'errors',
    'highlights',
    'user-rated',
  ] as EvalResultsFilterMode[])(
    'preserves %s mode with metadata-only matches',
    async (filterMode) => {
      const eval_ = await create([
        {
          metadata: { note: 'needle' },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'ok',
            comment: '!highlight',
            componentResults: [
              { pass: true, score: 1, reason: 'human', assertion: { type: 'human' } },
            ],
          },
        },
        { metadata: { note: 'needle' }, success: false, score: 0, failureReason: 1 },
        { metadata: { note: 'needle' }, success: false, score: 0, failureReason: 2 },
        {},
      ]);
      const expected =
        filterMode === 'all'
          ? [0, 1, 2]
          : filterMode === 'failures'
            ? [1]
            : filterMode === 'errors'
              ? [2]
              : [0];
      const page = await eval_.getTablePage({ filterMode, searchQuery: 'needle' });
      expect(page.body.map((row) => row.testIdx)).toEqual(expected);
      expect(page.filteredCount).toBe(expected.length);
      const metrics = await eval_.getFilteredMetrics({ filterMode, searchQuery: 'needle' });
      expect(
        metrics.reduce((n, m) => n + m.testPassCount + m.testFailCount + m.testErrorCount, 0),
      ).toBe(expected.length);
    },
  );

  it('preserves SQL pagination, blank searches, and explicit test indices', async () => {
    const eval_ = await create([
      { metadata: { note: 'needle' } },
      {},
      { metadata: { note: 'needle' } },
      { metadata: { note: 'needle' } },
    ]);
    const page = await eval_.getTablePage({ searchQuery: 'needle', limit: 1, offset: 1 });
    expect(page.body.map((row) => row.testIdx)).toEqual([2]);
    expect(page.filteredCount).toBe(3);
    expect(page.totalCount).toBe(4);
    expect((await eval_.getTablePage({ searchQuery: '   ' })).filteredCount).toBe(4);
    expect(
      (await eval_.getTablePage({ searchQuery: 'needle', testIndices: [1] })).body.map(
        (row) => row.testIdx,
      ),
    ).toEqual([1]);
  });

  it('keeps search values parameterized and scoped to the eval', async () => {
    const query = "' OR 1=1 --";
    const eval_ = await create([{ metadata: { note: query } }, {}]);
    await create([{ metadata: { note: query } }]);
    const page = await eval_.getTablePage({ searchQuery: query });
    expect(page.filteredCount).toBe(1);
    expect(page.body.map((row) => row.testIdx)).toEqual([0]);
    expect((await eval_.getTablePage({ searchQuery: 'no match' })).filteredCount).toBe(0);
  });

  it.each([
    { searchQuery: 'hidden-needle', expected: [] },
    { searchQuery: 'remote', expected: [1] },
    { searchQuery: 'public-marker', expected: [0] },
  ])(
    'excludes reserved metadata while searching $searchQuery',
    async ({ searchQuery, expected }) => {
      const eval_ = await create([
        {
          metadata: { __promptfoo: { trace: { id: 'hidden-needle' } } },
          testCase: {
            metadata: {
              // Remote dataset loading adds this reserved marker before persistence.
              __promptfoo: { remote: true, marker: 'hidden-needle' },
              note: 'public-marker',
            },
          },
        },
        { testCase: { metadata: { note: 'remote' } } },
      ]);
      const page = await eval_.getTablePage({ searchQuery });
      expect(page.body.map((row) => row.testIdx)).toEqual(expected);
      expect(page.filteredCount).toBe(expected.length);
      expect(
        (await eval_.getFilteredMetrics({ searchQuery })).reduce(
          (n, m) => n + m.testPassCount + m.testFailCount + m.testErrorCount,
          0,
        ),
      ).toBe(expected.length);
    },
  );
});
