/**
 * Tests for POST /api/eval/:id/resume endpoint.
 *
 * Covers:
 * - C2: 409 when a resume job is already active
 * - W1: Sets 'canceled' status when resume fails
 * - Happy path: returns 200 with jobId for incomplete eval
 */

import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../../src/database/index';
import { runDbMigrations } from '../../../src/migrate';
import Eval from '../../../src/models/eval';
import { evalJobs } from '../../../src/server/routes/eval';
import { createApp } from '../../../src/server/server';
import EvalFactory from '../../factories/evalFactory';

const { mockDoEvaluate } = vi.hoisted(() => ({
  mockDoEvaluate: vi.fn(),
}));

vi.mock('../../../src/util/config/load', () => ({
  resolveConfigs: vi.fn().mockResolvedValue({
    testSuite: {
      prompts: [{ raw: 'test prompt', label: 'test' }],
      providers: [{ id: 'test-provider' }],
      tests: [{ vars: { state: 'colorado' } }],
    },
  }),
}));

vi.mock('../../../src/evaluator', () => ({
  evaluate: mockDoEvaluate,
}));

describe('POST /api/eval/:id/resume', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    app = createApp();
    const db = getDb();
    await db.run('DELETE FROM eval_results');
    await db.run('DELETE FROM evals_to_datasets');
    await db.run('DELETE FROM evals_to_prompts');
    await db.run('DELETE FROM evals_to_tags');
    await db.run('DELETE FROM evals');

    evalJobs.clear();

    // Reset mock to default behavior
    mockDoEvaluate.mockReset();
    mockDoEvaluate.mockResolvedValue({
      id: 'test-eval-id',
      toEvaluateSummary: vi.fn().mockResolvedValue({ version: 3, results: [] }),
    });
  });

  afterEach(() => {
    evalJobs.clear();
  });

  it('should return 404 for non-existent eval', async () => {
    const response = await request(app).post('/api/eval/non-existent-id/resume').send({});

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: 'Eval not found' });
  });

  it('should allow resuming a stale running eval when no active job exists', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('running');
    await eval_.save();

    const response = await request(app).post(`/api/eval/${eval_.id}/resume`).send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
  });

  it('should return 409 when a resume job is already active (C2)', async () => {
    const eval_ = await EvalFactory.create();
    evalJobs.set('active-resume-job', {
      evalId: eval_.id,
      status: 'in-progress',
      progress: 0,
      total: 0,
      result: null,
      logs: [],
    });

    const response = await request(app).post(`/api/eval/${eval_.id}/resume`).send({});

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Evaluation is already running',
    });
  });

  it('should return 200 with jobId for an incomplete eval', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setExpectedTestCount(100);
    await eval_.save();

    const response = await request(app).post(`/api/eval/${eval_.id}/resume`).send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true });
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data).toHaveProperty('evalId', eval_.id);

    // Verify a job was created
    const jobId = response.body.data.id;
    expect(evalJobs.has(jobId)).toBe(true);
    expect(mockDoEvaluate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Eval),
      expect.objectContaining({ eventSource: 'web', resume: true }),
    );
  });

  it('should mark the eval running before dispatching resume work', async () => {
    const eval_ = await EvalFactory.create();
    type ResumeResult = {
      id: string;
      toEvaluateSummary: () => Promise<{ version: number; results: unknown[] }>;
    };
    let resolveResume!: (value: ResumeResult) => void;

    mockDoEvaluate.mockImplementationOnce(
      () =>
        new Promise<ResumeResult>((resolve) => {
          resolveResume = resolve;
        }),
    );

    const response = await request(app).post(`/api/eval/${eval_.id}/resume`).send({});

    expect(response.status).toBe(200);
    const reloadedEval = await Eval.findById(eval_.id);
    expect(reloadedEval?.evalStatus).toBe('running');

    resolveResume({
      id: eval_.id,
      toEvaluateSummary: vi.fn().mockResolvedValue({ version: 3, results: [] }),
    });
  });

  it('should allow resume for canceled evals', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setEvalStatus('canceled');
    await eval_.save();

    const response = await request(app).post(`/api/eval/${eval_.id}/resume`).send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should set eval status to canceled when resume fails (W1)', async () => {
    const eval_ = await EvalFactory.create();
    eval_.setExpectedTestCount(100);
    await eval_.save();

    const evalId = eval_.id;

    // Override evaluate mock to reject
    mockDoEvaluate.mockRejectedValue(new Error('Provider config missing'));

    const response = await request(app).post(`/api/eval/${evalId}/resume`).send({});

    expect(response.status).toBe(200);
    const jobId = response.body.data.id;

    // Wait for the async catch handler to execute
    await vi.waitFor(
      async () => {
        const job = evalJobs.get(jobId);
        expect(job?.status).toBe('error');
      },
      { timeout: 5000 },
    );

    // Verify the eval status was set to 'canceled' in the database
    const reloadedEval = await Eval.findById(evalId);
    expect(reloadedEval?.evalStatus).toBe('canceled');
  });
});
