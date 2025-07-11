import request from 'supertest';
import { runDbMigrations } from '../../src/migrate';
import { createApp } from '../../src/server/server';
import EvalFactory from '../factories/evalFactory';

describe('Metadata Filter Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await runDbMigrations();
  });

  // Helper function to create test results with metadata
  const createTestResult = (overrides: any) => ({
    testCase: { vars: {} },
    promptId: 'test-prompt',
    provider: { id: 'test-provider', label: 'test-label' },
    prompt: { raw: 'Test prompt', label: 'Test prompt' },
    vars: {},
    response: { output: 'test output' },
    error: null,
    failureReason: 0,
    success: true,
    score: 1,
    latencyMs: 100,
    gradingResult: { pass: true, score: 1, reason: 'Pass' },
    namedScores: {},
    cost: 0,
    ...overrides,
  });

  describe('GET /api/eval/:id/metadata-keys', () => {
    it('should return all unique metadata keys with counts', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      // Add results with metadata
      await eval_.addResult(
        createTestResult({
          description: 'test-1',
          promptIdx: 0,
          testIdx: 0,
          metadata: {
            model: 'gpt-4',
            temperature: 0.7,
            environment: 'production',
            tags: ['important', 'reviewed'],
          },
        }),
      );

      await eval_.addResult(
        createTestResult({
          description: 'test-2',
          promptIdx: 0,
          testIdx: 1,
          latencyMs: 150,
          metadata: {
            model: 'gpt-3.5-turbo',
            temperature: 0.5,
            environment: 'staging',
            tags: ['draft'],
          },
        }),
      );

      await eval_.addResult(
        createTestResult({
          description: 'test-3',
          promptIdx: 0,
          testIdx: 2,
          latencyMs: 200,
          metadata: {
            model: 'claude-2',
            temperature: 0.9,
            environment: 'production',
            version: '2.1.0',
          },
        }),
      );

      const response = await request(app).get(`/api/eval/${eval_.id}/metadata-keys`).expect(200);

      expect(response.body).toHaveProperty('keys');
      expect(response.body).toHaveProperty('counts');

      const { keys, counts } = response.body;

      // Check keys are present
      expect(keys).toContain('model');
      expect(keys).toContain('temperature');
      expect(keys).toContain('environment');
      expect(keys).toContain('tags');
      expect(keys).toContain('version');

      // Check counts are correct
      expect(counts.model).toBe(3);
      expect(counts.temperature).toBe(3);
      expect(counts.environment).toBe(3);
      expect(counts.tags).toBe(2);
      expect(counts.version).toBe(1);
    });

    it('should return 404 for non-existent eval', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app).get(`/api/eval/${nonExistentId}/metadata-keys`).expect(404);
      expect(response.status).toBe(404);
    });

  });

  describe('GET /api/eval/:id with metadata filter', () => {
    it('should filter results by exact metadata value', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      await eval_.addResult(
        createTestResult({
          description: 'test-1',
          promptIdx: 0,
          testIdx: 0,
          metadata: { model: 'gpt-4' },
        }),
      );

      await eval_.addResult(
        createTestResult({
          description: 'test-2',
          promptIdx: 0,
          testIdx: 1,
          latencyMs: 150,
          metadata: { model: 'gpt-3.5-turbo' },
        }),
      );

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ metadata: 'model:gpt-4' })
        .expect(200);

      // The /table endpoint returns a different structure
      expect(response.body.filteredCount).toBe(1);
      expect(response.body.table.body).toHaveLength(1);
      expect(response.body.table.body[0].outputs[0].metadata.model).toBe('gpt-4');
    });

    it('should filter results with wildcard at end', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      await eval_.addResult(
        createTestResult({
          description: 'test-1',
          promptIdx: 0,
          testIdx: 0,
          metadata: { model: 'gpt-4' },
        }),
      );

      await eval_.addResult(
        createTestResult({
          description: 'test-2',
          promptIdx: 0,
          testIdx: 1,
          latencyMs: 150,
          metadata: { model: 'gpt-3.5-turbo' },
        }),
      );

      await eval_.addResult(
        createTestResult({
          description: 'test-3',
          promptIdx: 0,
          testIdx: 2,
          latencyMs: 200,
          metadata: { model: 'claude-2' },
        }),
      );

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ metadata: 'model:gpt-*' })
        .expect(200);

      expect(response.body.filteredCount).toBe(2);
      expect(response.body.table.body).toHaveLength(2);
      response.body.table.body.forEach((row: any) => {
        expect(row.outputs[0].metadata.model).toMatch(/^gpt-/);
      });
    });

    it('should handle metadata filter with colons in value', async () => {
      const eval_ = await EvalFactory.create({ numResults: 0 });

      await eval_.addResult(
        createTestResult({
          description: 'test-url',
          promptIdx: 0,
          testIdx: 0,
          response: { output: 'test output with url' },
          metadata: {
            url: 'https://example.com:8080/path',
          },
        }),
      );

      const response = await request(app)
        .get(`/api/eval/${eval_.id}/table`)
        .query({ metadata: 'url:https://example.com:8080/path' })
        .expect(200);

      expect(response.body.filteredCount).toBe(1);
      expect(response.body.table.body).toHaveLength(1);
      expect(response.body.table.body[0].outputs[0].metadata.url).toBe(
        'https://example.com:8080/path',
      );
    });
  });
});
