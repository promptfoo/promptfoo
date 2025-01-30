import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { createApp } from '../../src/server/server';
import { deleteAllEvals } from '../../src/util';
import results_v3 from './v3evalToShare.json';
import results_v4 from './v4evalToShare.json';

describe('share', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    app = createApp();
    await deleteAllEvals();
  });

  it('should accept a version 3 results file', async () => {
    const res = await request(app).post('/api/eval').send(results_v3).timeout(5000);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');

    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
    expect(eval_?.version()).toBe(3);

    const results = await eval_?.getResults();
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(8);
  });

  it('should accept a new eval', async () => {
    const res = await request(app).post('/api/eval').send(results_v4).timeout(5000);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');

    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
    expect(eval_?.version()).toBe(4);

    const results = await eval_?.getResults();
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(8);
  });

  describe('error handling', () => {
    it('should handle empty request body', async () => {
      const res = await request(app).post('/api/eval').send({}).timeout(5000);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
    });

    it('should handle invalid v3 eval data', async () => {
      const res = await request(app)
        .post('/api/eval')
        .send({
          data: {
            results: null,
            config: null,
          },
        })
        .timeout(5000);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
    });

    it('should handle database errors', async () => {
      const res = await request(app)
        .post('/api/eval')
        .send({
          config: {},
          results: [],
        })
        .timeout(5000);

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
    });
  });
});
