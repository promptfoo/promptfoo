import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { createApp } from '../../src/server/server';
import results_v3 from './v3evalToShare.json';
import results_v4 from './v4evalToShare.json';

// Increase Jest timeout for all tests in this file
jest.setTimeout(30000);

describe('share', () => {
  let app: ReturnType<typeof createApp>;
  const testEvalIds = new Set<string>();

  beforeAll(async () => {
    // Run migrations once before all tests
    // This is safe because Jest setup ensures we're using an in-memory database
    await runDbMigrations();
    // Create app once and reuse for all tests
    app = createApp();
  });

  afterAll(async () => {
    // Clean up only the specific evals we created during tests
    for (const evalId of testEvalIds) {
      try {
        const eval_ = await Eval.findById(evalId);
        await eval_?.delete();
      } catch (error) {
        // Ignore cleanup errors - eval might already be deleted
      }
    }
  });

  afterEach(async () => {
    // Clean up evals created in the current test
    for (const evalId of testEvalIds) {
      try {
        const eval_ = await Eval.findById(evalId);
        await eval_?.delete();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    testEvalIds.clear();
  });

  it('should accept a version 3 results file', async () => {
    const res = await request(app).post('/api/eval').send(results_v3).expect(200);

    expect(res.body).toHaveProperty('id');
    expect(res.body.id).toBeTruthy();
    
    // Track this eval for cleanup
    testEvalIds.add(res.body.id);

    const eval_ = await Eval.findById(res.body.id as string);
    expect(eval_).not.toBeNull();
    expect(eval_?.version()).toBe(3);

    const results = await eval_?.getResults();
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(8);
  });

  it('should accept a new eval', async () => {
    const res = await request(app).post('/api/eval').send(results_v4).expect(200);

    expect(res.body).toHaveProperty('id');
    expect(res.body.id).toBeTruthy();
    
    // Track this eval for cleanup
    testEvalIds.add(res.body.id);

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
      const res = await request(app).post('/api/eval').send({}).expect(500);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
      
      // No eval was created, so nothing to track
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
        .expect(500);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
      
      // No eval was created, so nothing to track
    });

    it('should handle database errors', async () => {
      const res = await request(app)
        .post('/api/eval')
        .send({
          config: {},
          results: [],
        })
        .expect(500);

      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toBe('Failed to write eval to database');
      
      // No eval was created, so nothing to track
    });
  });
});
