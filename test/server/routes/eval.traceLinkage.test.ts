import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import EvalResult from '../../../src/models/evalResult';
import { createApp } from '../../../src/server/server';
import { createEvaluateResult } from '../../factories/eval';
import EvalFactory from '../../factories/evalFactory';

describe('Eval Routes - Trace linkage persistence', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;

  beforeAll(async () => {
    await runDbMigrations();
    await new Promise<void>((resolve, reject) => {
      server = createApp().listen(0, '127.0.0.1', (error?: Error) =>
        error ? reject(error) : resolve(),
      );
    });
    api = request.agent(server);
  });

  afterAll(async () => {
    if (!server.listening) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(async () => {
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');
  });

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
});
