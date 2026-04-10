import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE imports
vi.mock('../../../src/models/eval');
vi.mock('../../../src/globalConfig/accounts');

import Eval, { EvalQueries } from '../../../src/models/eval';
// Import after mocking
import { createApp } from '../../../src/server/server';

const mockedEval = vi.mocked(Eval);
const mockedEvalQueries = vi.mocked(EvalQueries);

describe('Eval Routes - Zod Validation', () => {
  let app: ReturnType<typeof createApp>;
  let mockFindById: ReturnType<typeof vi.fn>;
  let mockSave: ReturnType<typeof vi.fn>;
  let mockGetMetadataKeysFromEval: ReturnType<typeof vi.fn>;
  let mockGetMetadataValuesFromEval: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock methods
    mockFindById = vi.fn();
    mockSave = vi.fn();
    mockGetMetadataKeysFromEval = vi.fn();
    mockGetMetadataValuesFromEval = vi.fn();

    // Mock Eval.findById
    mockedEval.findById = mockFindById as any;

    // Mock EvalQueries methods
    mockedEvalQueries.getMetadataKeysFromEval = mockGetMetadataKeysFromEval as any;
    mockedEvalQueries.getMetadataValuesFromEval = mockGetMetadataValuesFromEval as any;

    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('PATCH /api/eval/:id/author', () => {
    it('should return 400 when body is empty', async () => {
      const response = await request(app).patch('/api/eval/test-id/author').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('author');
    });

    it('should return 400 when author is not a string', async () => {
      const response = await request(app).patch('/api/eval/test-id/author').send({
        author: 123,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('author');
    });

    it('should return 200 when author is valid', async () => {
      const mockEval = {
        id: 'test-id',
        author: 'old@example.com',
        save: mockSave,
      };

      mockFindById.mockResolvedValue(mockEval);
      mockSave.mockResolvedValue(undefined);

      const response = await request(app).patch('/api/eval/test-id/author').send({
        author: 'new@example.com',
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Author updated successfully');
      expect(mockEval.author).toBe('new@example.com');
    });
  });

  describe('GET /api/eval/:id/metadata-values', () => {
    it('should return 400 when key query param is missing', async () => {
      const response = await request(app).get('/api/eval/test-id/metadata-values');

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('key');
    });

    it('should return 200 when key query param is provided', async () => {
      const mockEval = {
        id: 'test-id',
      };

      mockFindById.mockResolvedValue(mockEval);
      mockGetMetadataValuesFromEval.mockReturnValue(['value1', 'value2']);

      const response = await request(app).get('/api/eval/test-id/metadata-values?key=testKey');

      expect(response.status).toBe(200);
      expect(response.body.values).toEqual(['value1', 'value2']);
    });
  });

  describe('GET /api/eval/:id/metadata-keys', () => {
    it('should return 400 when id param is too short', async () => {
      const response = await request(app).get('/api/eval/ab/metadata-keys');

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('id');
    });

    it('should return 200 with valid request', async () => {
      const mockEval = {
        id: 'test-id',
      };

      mockFindById.mockResolvedValue(mockEval);
      mockGetMetadataKeysFromEval.mockResolvedValue(['key1', 'key2']);

      const response = await request(app).get('/api/eval/test-id/metadata-keys');

      expect(response.status).toBe(200);
      expect(response.body.keys).toEqual(['key1', 'key2']);
    });
  });

  describe('POST /api/eval/:id/copy', () => {
    it('should return 404 when id param is whitespace (route does not match)', async () => {
      const response = await request(app).post('/api/eval/ /copy').send({});

      expect(response.status).toBe(404);
    });

    it('should return 201 with valid request', async () => {
      const mockCopy = vi.fn();
      const mockGetResultsCount = vi.fn();
      const mockEval = {
        id: 'test-id',
        copy: mockCopy,
        getResultsCount: mockGetResultsCount,
      };

      const copiedEval = {
        id: 'copied-id',
      };

      mockFindById.mockResolvedValue(mockEval);
      mockGetResultsCount.mockResolvedValue(10);
      mockCopy.mockResolvedValue(copiedEval);

      const response = await request(app).post('/api/eval/test-id/copy').send({
        description: 'Test copy',
      });

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('copied-id');
      expect(response.body.distinctTestCount).toBe(10);
    });

    it('should return 400 when description is not a string', async () => {
      const response = await request(app).post('/api/eval/test-id/copy').send({
        description: 123,
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('description');
    });

    it('should return 201 when description is omitted (optional field)', async () => {
      const mockCopy = vi.fn();
      const mockGetResultsCount = vi.fn();
      const mockEval = {
        id: 'test-id',
        copy: mockCopy,
        getResultsCount: mockGetResultsCount,
      };

      const copiedEval = {
        id: 'copied-id',
      };

      mockFindById.mockResolvedValue(mockEval);
      mockGetResultsCount.mockResolvedValue(5);
      mockCopy.mockResolvedValue(copiedEval);

      const response = await request(app).post('/api/eval/test-id/copy').send({});

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('copied-id');
      expect(mockCopy).toHaveBeenCalledWith(undefined, 5);
    });
  });

  describe('PATCH /api/eval/:id', () => {
    it('should accept empty body (both fields are optional)', async () => {
      // The schema allows empty body since both table and config are optional
      const response = await request(app).patch('/api/eval/test-id').send({});

      // This is a valid request - validation passes, but updateResult may fail
      // We're only testing validation behavior here
      expect(response.status).not.toBe(400);
    });

    it('should return 400 when table has invalid structure', async () => {
      const response = await request(app)
        .patch('/api/eval/test-id')
        .send({
          table: {
            head: 'invalid', // Should be an object
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/eval', () => {
    it('should return 400 when ids array is empty', async () => {
      const response = await request(app).delete('/api/eval').send({
        ids: [],
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('ids');
    });

    it('should return 400 when ids is missing', async () => {
      const response = await request(app).delete('/api/eval').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('ids');
    });

    it('should return 400 when ids contains empty string', async () => {
      const response = await request(app)
        .delete('/api/eval')
        .send({
          ids: ['valid-id', ''],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/eval/replay', () => {
    it('should return 400 when evaluationId is missing', async () => {
      const response = await request(app).post('/api/eval/replay').send({
        prompt: 'test prompt',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('evaluationId');
    });

    it('should return 400 when prompt is missing', async () => {
      const response = await request(app).post('/api/eval/replay').send({
        evaluationId: 'test-id',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('prompt');
    });

    it('should return 400 when prompt is empty string', async () => {
      const response = await request(app).post('/api/eval/replay').send({
        evaluationId: 'test-id',
        prompt: '',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('prompt');
    });
  });

  describe('POST /api/eval/:id/results', () => {
    it('should return 400 when results is not an array', async () => {
      const response = await request(app).post('/api/eval/test-id/results').send({
        results: 'not an array',
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when result is missing required fields', async () => {
      const response = await request(app)
        .post('/api/eval/test-id/results')
        .send([
          {
            promptIdx: 0,
            // Missing testIdx, success, score
          },
        ]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when promptIdx is negative', async () => {
      const response = await request(app)
        .post('/api/eval/test-id/results')
        .send([
          {
            promptIdx: -1,
            testIdx: 0,
            success: true,
            score: 1,
          },
        ]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('promptIdx');
    });
  });

  describe('GET /api/eval/job/:id', () => {
    it('should return 400 when id is not a valid UUID', async () => {
      const response = await request(app).get('/api/eval/job/not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error).toContain('id');
    });
  });
});
