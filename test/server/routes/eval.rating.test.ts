import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import EvalResult from '../../../src/models/evalResult';
import { createApp } from '../../../src/server/server';
import { ResultFailureReason } from '../../../src/types/index';
import invariant from '../../../src/util/invariant';
import {
  createCompletedPrompt,
  createEvaluateResult,
  createPromptMetrics,
} from '../../factories/eval';
import { setupTestServer } from '../../util/testServer';

import type { GradingResult } from '../../../src/types/index';

vi.mock('../../../src/database/signal', async () => ({
  ...(await vi.importActual('../../../src/database/signal')),
  updateSignalFile: vi.fn(),
}));

const metricAssertion: GradingResult = {
  pass: false,
  score: 0,
  reason: 'Metric observation',
  assertion: { type: 'javascript', metric: 'observed', metricOnly: true },
};
const metricSet: GradingResult = {
  pass: false,
  score: 0,
  reason: 'Metric-only set',
  metadata: { metricOnly: true },
  componentResults: [metricAssertion],
};
const passingAssertion: GradingResult = {
  pass: true,
  score: 0.5,
  reason: 'Ordinary assertion passed',
  assertion: { type: 'javascript' },
};

describe('persisted manual rating metrics', () => {
  const api = setupTestServer(createApp, runDbMigrations);
  const evalIds = new Set<string>();

  afterEach(async () => {
    for (const id of evalIds) {
      await (await Eval.findById(id))?.delete();
    }
    evalIds.clear();
  });

  async function createFixture(
    gradingResult: GradingResult,
    assertPassCount = 0,
    assertFailCount = 0,
    withSibling = false,
  ) {
    const prompt = createCompletedPrompt('Rating regression', {
      metrics: createPromptMetrics({
        score: gradingResult.score + (withSibling ? 0.5 : 0),
        testPassCount: Number(gradingResult.pass) + Number(withSibling),
        testFailCount: Number(!gradingResult.pass),
        assertPassCount: assertPassCount + Number(withSibling),
        assertFailCount,
        namedScores: { observed: 0 },
        namedScoresCount: { observed: 1 },
      }),
    });
    const eval_ = await Eval.create({ tests: [] }, [prompt], { id: randomUUID() });
    evalIds.add(eval_.id);
    await eval_.addPrompts([prompt]);
    await eval_.addResult(
      createEvaluateResult({
        prompt,
        success: gradingResult.pass,
        score: gradingResult.score,
        gradingResult,
        namedScores: { observed: 0 },
        failureReason: gradingResult.pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
      }),
    );
    if (withSibling) {
      await eval_.addResult(
        createEvaluateResult({
          prompt,
          testIdx: 1,
          score: 0.5,
          gradingResult: {
            pass: true,
            score: 0.5,
            reason: 'Untouched sibling',
            componentResults: [passingAssertion],
          },
        }),
      );
    }
    const [result] = await eval_.getResults();
    invariant(result instanceof EvalResult, 'Expected a persisted result');
    return { eval_, result };
  }

  function manualRating(original: GradingResult, pass: boolean): GradingResult {
    const score = Number(pass);
    return {
      ...original,
      pass,
      score,
      reason: 'Manual result (overrides all other grading results)',
      componentResults: [
        ...(original.componentResults ?? []),
        { pass, score, reason: 'Manual rating', assertion: { type: 'human' } },
      ],
    };
  }

  async function submitAndReload(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    gradingResult: GradingResult,
    assertPassCount: number,
    assertFailCount: number,
    withSibling = false,
  ) {
    const { eval_, result } = fixture;
    const response = await api
      .post(`/api/eval/${eval_.id}/results/${result.id}/rating`)
      .send(gradingResult);
    expect(response.status).toBe(200);

    const savedResult = await EvalResult.findById(result.id);
    expect(savedResult?.gradingResult).toEqual(gradingResult);
    expect(savedResult?.success).toBe(gradingResult.pass);
    expect(savedResult?.score).toBe(gradingResult.score);

    const savedEval = await Eval.findById(eval_.id);
    invariant(savedEval, 'Expected the saved eval');
    const table = await api.get(`/api/eval/${eval_.id}/table`);
    expect(table.status).toBe(200);
    const filtered = await savedEval.getFilteredMetrics({});
    for (const metrics of [
      savedEval.prompts[0].metrics,
      table.body.table.head.prompts[0].metrics,
      filtered[0],
    ]) {
      expect(metrics).toMatchObject({
        assertPassCount,
        assertFailCount,
        testPassCount: Number(gradingResult.pass) + Number(withSibling),
        testFailCount: Number(!gradingResult.pass),
      });
      expect(metrics?.score).toBeCloseTo(gradingResult.score + (withSibling ? 0.5 : 0));
    }
    expect(savedEval.prompts[0].metrics?.namedScores).toEqual({ observed: 0 });
    expect(savedEval.prompts[0].metrics?.namedScoresCount).toEqual({ observed: 1 });
  }

  it.each([
    ['assertion marker, passing row', metricAssertion, true],
    ['assertion marker, threshold-failing row', metricAssertion, false],
    ['set metadata marker, passing row', metricSet, true],
    ['set metadata marker, threshold-failing row', metricSet, false],
  ] as const)(
    'preserves zero counted assertions after apply/clear/reload: %s',
    async (_, metric, pass) => {
      const original: GradingResult = {
        pass,
        score: 0,
        reason: pass ? 'All assertions passed' : 'Aggregate score 0.00 < 0.5 threshold',
        componentResults: [metric],
        namedScores: { observed: 0 },
      };
      const fixture = await createFixture(original);
      await submitAndReload(fixture, manualRating(original, false), 0, 1);
      const passingRating = manualRating(original, true);
      await submitAndReload(fixture, passingRating, 1, 0);
      await submitAndReload(fixture, passingRating, 1, 0);
      await submitAndReload(fixture, original, 0, 0);
      await submitAndReload(fixture, original, 0, 0);
    },
  );

  it('reconciles every counted outcome while preserving an untouched sibling', async () => {
    const original: GradingResult = {
      pass: false,
      score: 0.5,
      reason: 'An ordinary assertion failed',
      componentResults: [
        passingAssertion,
        passingAssertion,
        { pass: false, score: 0.5, reason: 'Failed', assertion: { type: 'equals' } },
        metricAssertion,
        metricSet,
      ],
    };
    const fixture = await createFixture(original, 2, 1, true);
    const siblingBefore = (await fixture.eval_.getResults())[1];
    await submitAndReload(fixture, manualRating(original, false), 3, 2, true);
    await submitAndReload(fixture, manualRating(original, true), 4, 1, true);
    await submitAndReload(fixture, original, 3, 1, true);
    await submitAndReload(fixture, original, 3, 1, true);
    const siblingAfter = (await fixture.eval_.getResults())[1];
    expect(siblingAfter).toEqual(siblingBefore);
  });

  it('updates same-pass scores without counting score or comment edits as assertions', async () => {
    const original: GradingResult = {
      pass: true,
      score: 0.5,
      reason: 'Ordinary assertion passed',
      componentResults: [passingAssertion],
    };
    const fixture = await createFixture(original, 1);
    const scoreEdit = { ...original, score: 0.8 };
    await submitAndReload(fixture, scoreEdit, 1, 0);
    const commentEdit = { ...scoreEdit, comment: 'Reviewed' };
    await submitAndReload(fixture, commentEdit, 1, 0);
    await submitAndReload(fixture, commentEdit, 1, 0);
  });

  it.each([[undefined], [[]], [null]])(
    'handles absent or empty legacy components: %j',
    async (components) => {
      const original = {
        pass: true,
        score: 0.5,
        reason: 'No counted assertions',
        ...(components === undefined ? {} : { componentResults: components }),
      } as GradingResult;
      const fixture = await createFixture(original);
      await submitAndReload(fixture, manualRating(original, true), 1, 0);
      await submitAndReload(fixture, original, 0, 0);
      await submitAndReload(fixture, original, 0, 0);
    },
  );

  it('counts scalar SDK submissions from their stored components', async () => {
    const fixture = await createFixture(
      { pass: true, score: 0.5, reason: 'Passed', componentResults: [passingAssertion] },
      1,
    );
    const scalarRating: GradingResult = {
      pass: true,
      score: 1,
      reason: 'SDK rating',
      assertion: { type: 'human' },
    };
    await submitAndReload(fixture, scalarRating, 0, 0);
    await submitAndReload(fixture, scalarRating, 0, 0);
  });

  it.each([
    ['object instead of array', {}],
    ['string instead of array', 'invalid'],
    ['numeric entry', [1]],
    ['missing pass', [{}]],
    ['string pass', [{ pass: 'true' }]],
    ['null pass', [{ pass: null }]],
    ['string assertion flag', [{ pass: true, assertion: { metricOnly: 'false' } }]],
    ['numeric metadata flag', [{ pass: true, metadata: { metricOnly: 1 } }]],
    ['string assertion', [{ pass: true, assertion: 'invalid' }]],
    ['array assertion', [{ pass: true, assertion: [] }]],
    ['string metadata', [{ pass: true, metadata: 'invalid' }]],
    ['array metadata', [{ pass: true, metadata: [] }]],
  ])('rejects malformed rating components before writing: %s', async (_, componentResults) => {
    const original: GradingResult = {
      pass: true,
      score: 0.5,
      reason: 'Original grading result',
      componentResults: [passingAssertion],
    };
    const fixture = await createFixture(original, 1);
    const metricsBefore = fixture.eval_.prompts[0].metrics;
    const response = await api
      .post(`/api/eval/${fixture.eval_.id}/results/${fixture.result.id}/rating`)
      .send({ pass: false, score: 0, componentResults });
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual(expect.any(String));
    expect(response.body.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.arrayContaining(['componentResults']) }),
      ]),
    );
    const savedResult = await EvalResult.findById(fixture.result.id);
    expect(savedResult?.gradingResult).toEqual(original);
    expect(savedResult?.success).toBe(true);
    expect(savedResult?.score).toBe(0.5);
    const savedEval = await Eval.findById(fixture.eval_.id);
    invariant(savedEval, 'Expected the unchanged eval');
    expect(savedEval.prompts[0].metrics).toEqual(metricsBefore);
    const table = await api.get(`/api/eval/${fixture.eval_.id}/table`);
    expect(table.status).toBe(200);
    for (const metrics of [
      table.body.table.head.prompts[0].metrics,
      (await savedEval.getFilteredMetrics({}))[0],
    ]) {
      expect(metrics).toMatchObject({
        assertPassCount: 1,
        assertFailCount: 0,
        testPassCount: 1,
        testFailCount: 0,
        score: 0.5,
      });
    }
  });

  it.each([
    ['partial component', [{ pass: true }], 1],
    ['null containers and entry', [null, { pass: true, assertion: null, metadata: null }], 1],
    [
      'null flags',
      [{ pass: true, assertion: { metricOnly: null }, metadata: { metricOnly: null } }],
      1,
    ],
    [
      'false flags',
      [{ pass: true, assertion: { metricOnly: false }, metadata: { metricOnly: false } }],
      1,
    ],
    [
      'legacy set assertion',
      [{ pass: false, assertion: { type: 'assert-set', metricOnly: true } }],
      0,
    ],
    [
      'set metadata',
      [{ pass: false, metadata: { metricOnly: true, custom: { retained: true } } }],
      0,
    ],
    [
      'opaque assertion fields',
      [
        {
          pass: true,
          assertion: { type: 'custom', provider: { id: 'custom' }, config: { retained: true } },
          custom: ['retained'],
        },
      ],
      1,
    ],
  ] as const)(
    'preserves supported rating components: %s',
    async (_, componentResults, passCount) => {
      const fixture = await createFixture({ pass: true, score: 0.5, reason: 'Original' });
      const rating = {
        pass: true,
        score: 0.75,
        reason: 'SDK grading result',
        componentResults,
      } as unknown as GradingResult;
      await submitAndReload(fixture, rating, passCount, 0);
    },
  );
});
