import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';
import { getDb } from '../../src/database';
import { tracesTable, spansTable } from '../../src/database/tables';
import { TraceStore } from '../../src/tracing/store';

// Mock the database
jest.mock('../../src/database');
jest.mock('crypto', () => ({
  ...(jest.requireActual('crypto') as any),
  randomUUID: jest.fn(() => 'test-uuid'),
}));

describe('TraceStore', () => {
  let traceStore: TraceStore;
  let mockDb: any;

  beforeEach(() => {
    // Create mock database methods
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockImplementation(() => Promise.resolve()),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => Promise.resolve([])),
      delete: jest.fn().mockReturnThis(),
    };

    // Mock getDb to return our mock database
    (getDb as jest.Mock).mockReturnValue(mockDb);

    // Create trace store instance
    traceStore = new TraceStore();
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

      expect(mockDb.insert).toHaveBeenCalledWith(tracesTable);
      expect(mockDb.values).toHaveBeenCalledWith({
        id: 'test-uuid',
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
        metadata: { test: 'data' },
      });
    });

    it('should handle errors when creating trace', async () => {
      const error = new Error('Database error');
      mockDb.values.mockRejectedValueOnce(error);

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
      mockDb.limit.mockImplementationOnce(() => Promise.resolve([{ traceId: 'test-trace-id' }]));

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
      expect(mockDb.from).toHaveBeenCalledWith(tracesTable);
      expect(mockDb.where).toHaveBeenCalledWith(eq(tracesTable.traceId, 'test-trace-id'));

      expect(mockDb.insert).toHaveBeenCalledWith(spansTable);
      expect(mockDb.values).toHaveBeenCalledWith([
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
      mockDb.limit.mockImplementationOnce(() => Promise.resolve([]));

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
      expect(mockDb.insert).not.toHaveBeenCalledWith(spansTable);
    });

    it('should handle errors when adding spans', async () => {
      // Mock trace exists
      mockDb.limit.mockImplementationOnce(() => Promise.resolve([{ traceId: 'test-trace-id' }]));

      // Mock insert error
      const error = new Error('Insert failed');
      mockDb.values.mockRejectedValueOnce(error);

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
      const traceQuery = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => Promise.resolve(mockTraces)),
      };
      mockDb.select.mockReturnValueOnce(traceQuery);

      // Mock span queries
      const spanQuery1 = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => Promise.resolve(mockSpans['trace-1'])),
      };
      const spanQuery2 = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => Promise.resolve(mockSpans['trace-2'])),
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
      const traceQuery = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => Promise.resolve([])),
      };
      mockDb.select.mockReturnValue(traceQuery);

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

      // Mock trace query
      mockDb.limit.mockImplementationOnce(() => Promise.resolve([mockTrace]));

      // Mock spans query
      const spanQuery = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockImplementation(() => Promise.resolve(mockSpans)),
      };
      mockDb.select.mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTrace('trace-1');

      expect(result).toEqual({
        ...mockTrace,
        spans: mockSpans,
      });
    });

    it('should return null if trace not found', async () => {
      mockDb.limit.mockImplementationOnce(() => Promise.resolve([]));

      const result = await traceStore.getTrace('non-existent-trace');

      expect(result).toBeNull();
    });
  });

  describe('deleteOldTraces', () => {
    it('should delete traces older than retention period', async () => {
      const retentionDays = 30;
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      await traceStore.deleteOldTraces(retentionDays);

      expect(mockDb.delete).toHaveBeenCalledWith(tracesTable);
      expect(mockDb.where).toHaveBeenCalledWith(eq(tracesTable.createdAt, cutoffTime));
    });

    it('should handle errors when deleting old traces', async () => {
      const error = new Error('Delete failed');
      mockDb.where.mockImplementation(() => Promise.reject(error));

      await expect(traceStore.deleteOldTraces(30)).rejects.toThrow('Delete failed');
    });
  });
});
