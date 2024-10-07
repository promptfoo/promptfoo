import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { createApp } from '../../src/server/server';
import results_v3 from './v3evalToShare.json';
import results_v4 from './v4evalToShare.json';

describe('share', () => {
  const app = createApp();
  beforeAll(async () => {
    await runDbMigrations();
  });

  it('should accept a version 3 results file', async () => {
    const res = await request(app).post('/api/eval').send(results_v3);
    expect(res.status).toBe(200);
    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
    expect(eval_?.version()).toBe(3);
    const results = await eval_?.getResults();
    expect(results).toHaveLength(8);
  });

  it('should accept a new eval', async () => {
    const res = await request(app).post('/api/eval').send(results_v4);
    expect(res.status).toBe(200);
    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
    expect(eval_?.version()).toBe(4);
    const results = await eval_?.getResults();
    expect(results).toHaveLength(8);
  });
});
