import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import { createApp } from '../../../src/server/server';

// Mock dependencies
vi.mock('../../../src/tracing/store');

// Import after mocking
import { getTraceStore } from '../../../src/tracing/store';

const mockedGetTraceStore = vi.mocked(getTraceStore);

describe('Traces Routes', () => {
  let api: ReturnType<typeof request.agent>;
  let server: Server;
  let mockGetTracesByEvaluation: ReturnType<typeof vi.fn>;
  let mockGetTrace: ReturnType<typeof vi.fn>;
  let mockAppendTraces: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
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

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup mock trace store methods
    mockGetTracesByEvaluation = vi.fn();
    mockGetTrace = vi.fn();
    mockAppendTraces = vi.fn().mockResolvedValue(true);

    mockedGetTraceStore.mockReturnValue({
      getTracesByEvaluation: mockGetTracesByEvaluation,
      getTrace: mockGetTrace,
    } as any);
    vi.spyOn(Eval, 'findById').mockResolvedValue({
      id: 'eval-123',
      appendTraces: mockAppendTraces,
    } as unknown as Eval);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  describe('POST /api/eval/:id/traces', () => {
    const span = {
      spanId: 'span-1',
      name: 'provider call',
      startTime: 1000,
      endTime: 2000,
    };

    function trace(traceId: string, evaluationId: string = 'source-eval') {
      return {
        traceId,
        evaluationId,
        testCaseId: 'test-case-1',
        metadata: { source: 'share' },
        spans: [span],
      };
    }

    it('delegates validated traces to the target eval', async () => {
      const traces = [trace('trace-new')];
      const response = await api.post('/api/eval/eval-123/traces').send(traces);

      expect(response.status).toBe(204);
      expect(mockAppendTraces).toHaveBeenCalledWith(traces);
    });

    it('is idempotent when the trace already belongs to the eval', async () => {
      const traces = [trace('trace-existing')];
      const response = await api.post('/api/eval/eval-123/traces').send(traces);

      expect(response.status).toBe(204);
      expect(mockAppendTraces).toHaveBeenCalledWith(traces);
    });

    it('returns a conflict when trace IDs belong to a different eval', async () => {
      mockAppendTraces.mockResolvedValue(false);

      const response = await api
        .post('/api/eval/eval-123/traces')
        .send([trace('trace-safe'), trace('trace-collision')]);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Trace ID already exists' });
      expect(mockAppendTraces).toHaveBeenCalledOnce();
    });

    it('rejects duplicate trace IDs in one request', async () => {
      const response = await api
        .post('/api/eval/eval-123/traces')
        .send([trace('trace-duplicate'), trace('trace-duplicate')]);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Duplicate trace ID in request' });
      expect(mockAppendTraces).not.toHaveBeenCalled();
    });

    it('rejects trace writes for an eval that does not exist', async () => {
      vi.mocked(Eval.findById).mockResolvedValueOnce(undefined);

      const response = await api
        .post('/api/eval/missing-eval/traces')
        .send([trace('trace-orphan')]);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Eval not found' });
      expect(mockAppendTraces).not.toHaveBeenCalled();
    });

    it('returns 500 when trace persistence fails', async () => {
      mockAppendTraces.mockRejectedValue(new Error('Database connection failed'));

      const response = await api.post('/api/eval/eval-123/traces').send([trace('trace-error')]);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to add traces to eval' });
    });
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

      const response = await api.get('/api/traces/evaluation/eval-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        traces: mockTraces,
      });
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-123');
    });

    it('should return empty array when no traces found', async () => {
      mockGetTracesByEvaluation.mockResolvedValue([]);

      const response = await api.get('/api/traces/evaluation/eval-456');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        traces: [],
      });
      expect(mockGetTracesByEvaluation).toHaveBeenCalledWith('eval-456');
    });

    it('should return 500 on database error', async () => {
      mockGetTracesByEvaluation.mockRejectedValue(new Error('Database connection failed'));

      const response = await api.get('/api/traces/evaluation/eval-789');

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

      const response = await api.get('/api/traces/trace-abc');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        trace: mockTrace,
      });
      expect(mockGetTrace).toHaveBeenCalledWith('trace-abc');
    });

    it('should return 404 when trace not found', async () => {
      mockGetTrace.mockResolvedValue(null);

      const response = await api.get('/api/traces/trace-nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: 'Trace not found',
      });
      expect(mockGetTrace).toHaveBeenCalledWith('trace-nonexistent');
    });

    it('should return 500 on database error', async () => {
      mockGetTrace.mockRejectedValue(new Error('Database connection failed'));

      const response = await api.get('/api/traces/trace-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch trace',
      });
    });
  });
});
