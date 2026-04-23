import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';

// Mock dependencies
vi.mock('../../../src/tracing/store');

// Import after mocking
import { getTraceStore } from '../../../src/tracing/store';

const mockedGetTraceStore = vi.mocked(getTraceStore);

describe('Traces Routes', () => {
  let app: ReturnType<typeof createApp>;
  let mockGetTracesByEvaluation: ReturnType<typeof vi.fn>;
  let mockGetTrace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock trace store methods
    mockGetTracesByEvaluation = vi.fn();
    mockGetTrace = vi.fn();

    mockedGetTraceStore.mockReturnValue({
      getTracesByEvaluation: mockGetTracesByEvaluation,
      getTrace: mockGetTrace,
    } as any);

    app = createApp();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/traces/evaluation/:evaluationId', () => {
    it('should return traces array when traces exist', async () => {
      const mockTraces = [
        {
          id: '1',
          traceId: 'trace-1',
          evaluationId: 'eval-123',
          testCaseId: 'test-1',
          spans: [],
        },
        {
          id: '2',
          traceId: 'trace-2',
          evaluationId: 'eval-123',
          testCaseId: 'test-2',
          spans: [],
        },
      ];

      mockGetTracesByEvaluation.mockResolvedValue(mockTraces);

      const response = await request(app).get('/api/traces/evaluation/eval-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        traces: mockTraces,
      });
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-123', {
        sanitizeAttributes: false,
      });
    });

    it('should sanitize trace metadata and span attributes by default', async () => {
      mockGetTracesByEvaluation.mockResolvedValue([
        {
          id: '1',
          traceId: 'trace-1',
          evaluationId: 'eval-123',
          testCaseId: 'test-1',
          metadata: {
            apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
            safe: 'visible',
          },
          spans: [
            {
              id: 'span-1',
              spanId: 'span-123',
              attributes: {
                authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
                safe: 'visible',
              },
            },
          ],
        },
      ]);

      const response = await request(app).get('/api/traces/evaluation/eval-123');

      expect(response.status).toBe(200);
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-123', {
        sanitizeAttributes: false,
      });
      expect(response.body.traces[0].metadata).toEqual({
        apiKey: '[REDACTED]',
        safe: 'visible',
      });
      expect(response.body.traces[0].spans[0].attributes).toEqual({
        authorization: '[REDACTED]',
        safe: 'visible',
      });
    });

    it('should allow raw trace responses when sanitization is explicitly disabled', async () => {
      mockGetTracesByEvaluation.mockResolvedValue([
        {
          id: '1',
          traceId: 'trace-1',
          evaluationId: 'eval-123',
          testCaseId: 'test-1',
          metadata: {
            apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
          },
          spans: [
            {
              id: 'span-1',
              spanId: 'span-123',
              attributes: {
                authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
              },
            },
          ],
        },
      ]);

      const response = await request(app).get('/api/traces/evaluation/eval-123?sanitize=false');

      expect(response.status).toBe(200);
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-123', {
        sanitizeAttributes: false,
      });
      expect(response.body.traces[0].metadata.apiKey).toBe('sk-abcdefghijklmnopqrstuvwxyz');
      expect(response.body.traces[0].spans[0].attributes.authorization).toBe(
        'Bearer abcdefghijklmnopqrstuvwxyz',
      );
    });

    it('should return empty array when no traces found', async () => {
      mockGetTracesByEvaluation.mockResolvedValue([]);

      const response = await request(app).get('/api/traces/evaluation/eval-456');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        traces: [],
      });
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-456', {
        sanitizeAttributes: false,
      });
    });

    it('should return 500 on database error', async () => {
      mockGetTracesByEvaluation.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/traces/evaluation/eval-789');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch traces',
      });
    });
  });

  describe('GET /api/traces/:traceId', () => {
    it('should return trace when found', async () => {
      const mockTrace = {
        id: '1',
        traceId: 'trace-abc',
        evaluationId: 'eval-123',
        testCaseId: 'test-1',
        spans: [
          {
            id: 'span-1',
            spanId: 'span-123',
            name: 'api-call',
            startTime: 1234567890,
            endTime: 1234567900,
          },
        ],
      };

      mockGetTrace.mockResolvedValue(mockTrace);

      const response = await request(app).get('/api/traces/trace-abc');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        trace: mockTrace,
      });
      expect(mockGetTrace).toHaveBeenCalledWith('trace-abc', {
        sanitizeAttributes: false,
      });
    });

    it('should sanitize single trace responses by default', async () => {
      mockGetTrace.mockResolvedValue({
        id: '1',
        traceId: 'trace-abc',
        evaluationId: 'eval-123',
        testCaseId: 'test-1',
        metadata: {
          token: 'sk-abcdefghijklmnopqrstuvwxyz',
        },
        spans: [
          {
            id: 'span-1',
            spanId: 'span-123',
            attributes: {
              'x-api-key': 'key-abcdefghijklmnopqrstuvwxyz',
            },
          },
        ],
      });

      const response = await request(app).get('/api/traces/trace-abc');

      expect(response.status).toBe(200);
      expect(mockGetTrace).toHaveBeenCalledWith('trace-abc', {
        sanitizeAttributes: false,
      });
      expect(response.body.trace.metadata.token).toBe('[REDACTED]');
      expect(response.body.trace.spans[0].attributes['x-api-key']).toBe('[REDACTED]');
    });

    it('should allow raw single trace responses when sanitization is explicitly disabled', async () => {
      mockGetTrace.mockResolvedValue({
        id: '1',
        traceId: 'trace-abc',
        evaluationId: 'eval-123',
        testCaseId: 'test-1',
        metadata: {
          token: 'sk-abcdefghijklmnopqrstuvwxyz',
        },
        spans: [
          {
            id: 'span-1',
            spanId: 'span-123',
            attributes: {
              'x-api-key': 'key-abcdefghijklmnopqrstuvwxyz',
            },
          },
        ],
      });

      const response = await request(app).get('/api/traces/trace-abc?sanitize=false');

      expect(response.status).toBe(200);
      expect(mockGetTrace).toHaveBeenCalledWith('trace-abc', {
        sanitizeAttributes: false,
      });
      expect(response.body.trace.metadata.token).toBe('sk-abcdefghijklmnopqrstuvwxyz');
      expect(response.body.trace.spans[0].attributes['x-api-key']).toBe(
        'key-abcdefghijklmnopqrstuvwxyz',
      );
    });

    it('should return 404 when trace not found', async () => {
      mockGetTrace.mockResolvedValue(null);

      const response = await request(app).get('/api/traces/trace-nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Trace not found',
      });
      expect(mockGetTrace).toHaveBeenCalledWith('trace-nonexistent', {
        sanitizeAttributes: false,
      });
    });

    it('should return 500 on database error', async () => {
      mockGetTrace.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/traces/trace-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch trace',
      });
    });
  });
});
