import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { lt } from 'drizzle-orm';
import { TraceStore } from '../../src/tracing/store';

// Mock crypto before importing TraceStore
const mockUUID = jest.fn(() => 'test-uuid');
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: () => 'test-uuid',
}));

describe('TraceStore', () => {
  let traceStore: TraceStore;
  let mockDb: any;

  beforeEach(() => {
    // Create mock database methods that properly chain
    const mockInsertChain = {
      values: jest.fn().mockResolvedValue(undefined),
    };
    const mockSelectChain = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const mockDeleteChain = {
      where: jest.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      insert: jest.fn().mockReturnValue(mockInsertChain),
      select: jest.fn().mockReturnValue(mockSelectChain),
      delete: jest.fn().mockReturnValue(mockDeleteChain),
    };

    // Create trace store and inject mock DB
    traceStore = new TraceStore();
    // Use private property access to inject the mock
    (traceStore as any).db = mockDb;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTrace', () => {
    it('should create a new trace record', async () => {
      const traceData = {
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
        metadata: { test: 'data' },
      };

      await traceStore.createTrace(traceData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.insert().values).toHaveBeenCalledWith({
        id: 'test-uuid',
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
        metadata: { test: 'data' },
      });
    });

    it('should handle errors when creating trace', async () => {
      const error = new Error('Database error');
      mockDb.insert().values.mockRejectedValueOnce(error);

      const traceData = {
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
      };

      await expect(traceStore.createTrace(traceData)).rejects.toThrow('Database error');
    });
  });

  describe('addSpans', () => {
    it('should add spans to an existing trace', async () => {
      // Mock trace exists check
      mockDb
        .select()
        .from()
        .where()
        .limit.mockResolvedValueOnce([{ traceId: 'test-trace-id' }]);

      const spans = [
        {
          spanId: 'span-1',
          name: 'operation-1',
          startTime: 1000,
          endTime: 2000,
          attributes: { key: 'value' },
        },
        {
          spanId: 'span-2',
          parentSpanId: 'span-1',
          name: 'operation-2',
          startTime: 1100,
          endTime: 1900,
          statusCode: 0,
          statusMessage: 'OK',
        },
      ];

      await traceStore.addSpans('test-trace-id', spans);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.select().from).toHaveBeenCalled();
      expect(mockDb.select().from().where).toHaveBeenCalled();

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.insert().values).toHaveBeenCalledWith([
        {
          id: 'test-uuid',
          traceId: 'test-trace-id',
          spanId: 'span-1',
          parentSpanId: undefined,
          name: 'operation-1',
          startTime: 1000,
          endTime: 2000,
          attributes: { key: 'value' },
          statusCode: undefined,
          statusMessage: undefined,
        },
        {
          id: 'test-uuid',
          traceId: 'test-trace-id',
          spanId: 'span-2',
          parentSpanId: 'span-1',
          name: 'operation-2',
          startTime: 1100,
          endTime: 1900,
          attributes: undefined,
          statusCode: 0,
          statusMessage: 'OK',
        },
      ]);
    });

    it('should skip spans if trace does not exist', async () => {
      // Mock trace does not exist
      mockDb.select().from().where().limit.mockResolvedValueOnce([]);

      const spans = [
        {
          spanId: 'span-1',
          name: 'operation-1',
          startTime: 1000,
        },
      ];

      await traceStore.addSpans('non-existent-trace', spans);

      // Should check for trace existence
      expect(mockDb.select).toHaveBeenCalled();

      // Should not insert spans
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('should handle errors when adding spans', async () => {
      // Mock trace exists
      mockDb
        .select()
        .from()
        .where()
        .limit.mockResolvedValueOnce([{ traceId: 'test-trace-id' }]);

      // Mock insert error
      const error = new Error('Insert failed');
      mockDb.insert().values.mockRejectedValueOnce(error);

      const spans = [
        {
          spanId: 'span-1',
          name: 'operation-1',
          startTime: 1000,
        },
      ];

      await expect(traceStore.addSpans('test-trace-id', spans)).rejects.toThrow('Insert failed');
    });
  });

  describe('getTracesByEvaluation', () => {
    it('should retrieve all traces for an evaluation', async () => {
      const mockTraces = [
        { id: '1', traceId: 'trace-1', evaluationId: 'eval-1' },
        { id: '2', traceId: 'trace-2', evaluationId: 'eval-1' },
      ];

      const mockSpans = {
        'trace-1': [
          { id: '1', traceId: 'trace-1', spanId: 'span-1-1' },
          { id: '2', traceId: 'trace-1', spanId: 'span-1-2' },
        ],
        'trace-2': [{ id: '3', traceId: 'trace-2', spanId: 'span-2-1' }],
      };

      // Mock trace query
      mockDb.select().from().where.mockResolvedValueOnce(mockTraces);

      // Mock span queries
      // Reset and set up new select mock chains for spans
      mockDb.select = jest.fn();
      const spanQuery1 = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce(mockSpans['trace-1']),
      };
      const spanQuery2 = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce(mockSpans['trace-2']),
      };
      mockDb.select.mockReturnValueOnce(spanQuery1).mockReturnValueOnce(spanQuery2);

      const result = await traceStore.getTracesByEvaluation('eval-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        ...mockTraces[0],
        spans: mockSpans['trace-1'],
      });
      expect(result[1]).toEqual({
        ...mockTraces[1],
        spans: mockSpans['trace-2'],
      });
    });

    it('should return empty array if no traces found', async () => {
      mockDb.select().from().where.mockResolvedValueOnce([]);

      const result = await traceStore.getTracesByEvaluation('non-existent-eval');

      expect(result).toEqual([]);
    });
  });

  describe('getTrace', () => {
    it('should retrieve a single trace with spans', async () => {
      const mockTrace = { id: '1', traceId: 'trace-1', evaluationId: 'eval-1' };
      const mockSpans = [
        { id: '1', traceId: 'trace-1', spanId: 'span-1' },
        { id: '2', traceId: 'trace-1', spanId: 'span-2' },
      ];

      // Mock trace query - update the select chain to include limit
      const traceSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce([mockTrace]),
      };
      mockDb.select = jest.fn().mockReturnValueOnce(traceSelectChain);

      // Mock spans query
      const spanQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce(mockSpans),
      };
      mockDb.select.mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTrace('trace-1');

      expect(result).toEqual({
        ...mockTrace,
        spans: mockSpans,
      });
    });

    it('should return null if trace not found', async () => {
      // Mock trace query - update the select chain to include limit
      const traceSelectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce([]),
      };
      mockDb.select = jest.fn().mockReturnValueOnce(traceSelectChain);

      const result = await traceStore.getTrace('non-existent-trace');

      expect(result).toBeNull();
    });
  });

  describe('deleteOldTraces', () => {
    it('should delete traces older than retention period', async () => {
      const retentionDays = 30;

      await traceStore.deleteOldTraces(retentionDays);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockDb.delete().where).toHaveBeenCalled();
    });

    it('should handle errors when deleting old traces', async () => {
      const error = new Error('Delete failed');
      mockDb.delete().where.mockRejectedValueOnce(error);

      await expect(traceStore.deleteOldTraces(30)).rejects.toThrow('Delete failed');
    });
  });
});
