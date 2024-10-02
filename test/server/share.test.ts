import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { createApp } from '../../src/server/server';
import results from './evalToShare.json';

describe('share', () => {
  const app = createApp();
  beforeAll(async () => {
    await runDbMigrations();
  });

  it('should accept a version 3 results file', async () => {
    const res = await request(app).post('/api/eval').send(results);
    expect(res.status).toBe(200);
    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
  });
});
