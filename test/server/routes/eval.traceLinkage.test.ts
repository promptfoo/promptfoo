import { beforeEach, describe, expect, it } from 'vitest';
import { runDbMigrations } from '../../../src/migrate';
import EvalResult from '../../../src/models/evalResult';
import { createApp } from '../../../src/server/server';
import { createEvaluateResult } from '../../factories/eval';
import EvalFactory from '../../factories/evalFactory';
import { clearEvalTables } from '../../util/evalDb';
import { setupTestServer } from '../../util/testServer';

describe('Eval Routes - Trace linkage persistence', () => {
  const api = setupTestServer(createApp, runDbMigrations);

  beforeEach(() => clearEvalTables());

  it('keeps trace linkage when v4 eval saves include traced rows', async () => {
    const tracedResult = createEvaluateResult({
      traceId: 'route-create-trace-id',
      evaluationId: 'route-create-evaluation-id',
      metadata: { source: 'route-create' },
    });

    const response = await api.post('/api/eval').send({
      config: { description: 'Trace linkage route coverage' },
      prompts: [],
      results: [tracedResult],
    });

    expect(response.status).toBe(200);

    const [persistedResult] = await EvalResult.findManyByEvalId(response.body.id);
    expect(persistedResult.toEvaluateResult()).toMatchObject({
      traceId: 'route-create-trace-id',
      evaluationId: 'route-create-evaluation-id',
      metadata: { source: 'route-create' },
    });
  });

  it('keeps trace linkage when appended results arrive through POST /api/eval/:id/results', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    const tracedResult = createEvaluateResult({
      traceId: 'route-append-trace-id',
      evaluationId: 'route-append-evaluation-id',
      metadata: { source: 'route-append' },
    });

    const response = await api.post(`/api/eval/${eval_.id}/results`).send([
      {
        id: 'route-append-trace-result',
        evalId: eval_.id,
        ...tracedResult,
      },
    ]);

    expect(response.status).toBe(204);

    const [persistedResult] = await EvalResult.findManyByEvalId(eval_.id);
    expect(persistedResult.toEvaluateResult()).toMatchObject({
      traceId: 'route-append-trace-id',
      evaluationId: 'route-append-evaluation-id',
      metadata: { source: 'route-append' },
    });
  });

  it('preserves prior result chunks across repeated append requests', async () => {
    const eval_ = await EvalFactory.create({ numResults: 0 });
    for (const testIdx of [0, 1]) {
      const response = await api.post(`/api/eval/${eval_.id}/results`).send([
        {
          id: `chunk-result-${testIdx}`,
          evalId: eval_.id,
          ...createEvaluateResult({ testIdx }),
        },
      ]);
      expect(response.status).toBe(204);
    }

    const results = await EvalResult.findManyByEvalId(eval_.id);
    expect(results.map((result) => result.testIdx).sort()).toEqual([0, 1]);
  });
});
