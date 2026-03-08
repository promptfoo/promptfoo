import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock crypto.randomUUID using vi.stubGlobal
const mockRandomUUID = vi.fn(() => 'test-uuid');
vi.stubGlobal('crypto', {
  ...crypto,
  randomUUID: mockRandomUUID,
});

// Mock logger
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Dynamic import after mocking - initialized in beforeAll
let TraceStore: typeof import('../../src/tracing/store').TraceStore;

describe('TraceStore', () => {
  let traceStore: InstanceType<typeof TraceStore>;
  let mockDb: any;

  beforeAll(async () => {
    const mod = await import('../../src/tracing/store');
    TraceStore = mod.TraceStore;
  });

  beforeEach(async () => {
    // Reset the UUID mock
    mockRandomUUID.mockReturnValue('test-uuid');

    // Create mock database methods that properly chain
    const mockInsertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    };
    const mockSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve([])),
    };
    const mockDeleteChain = {
      where: vi.fn(() => Promise.resolve(undefined)),
    };

    mockDb = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockSelectChain),
      delete: vi.fn(() => mockDeleteChain),
    };

    // Create trace store and inject mock DB
    traceStore = new TraceStore();
    // Use private property access to inject the mock
    (traceStore as any).db = mockDb;
  });

  afterEach(() => {
    vi.clearAllMocks();
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

      expect(mockDb.insert).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.insert().values).toHaveBeenCalledWith({
        id: 'test-uuid',
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
        metadata: { test: 'data' },
      });
      expect(mockDb.insert().values().onConflictDoNothing).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.anything(),
        }),
      );
    });

    it('should handle errors when creating trace', async () => {
      const error = new Error('Database error');
      mockDb.insert().values().onConflictDoNothing.mockRejectedValueOnce(error);

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

      expect(mockDb.select).toHaveBeenCalledWith();
      expect(mockDb.select().from).toHaveBeenCalledWith(expect.anything());
      expect(mockDb.select().from().where).toHaveBeenCalledWith(expect.anything());

      expect(mockDb.insert).toHaveBeenCalledWith(expect.anything());
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
      expect(mockDb.insert().values().onConflictDoNothing).toHaveBeenCalledWith({
        target: [expect.anything(), expect.anything()],
      });
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
      expect(mockDb.select).toHaveBeenCalledWith();

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
      mockDb.insert().values().onConflictDoNothing.mockRejectedValueOnce(error);

      const spans = [
        {
          spanId: 'span-1',
          name: 'operation-1',
          startTime: 1000,
        },
      ];

      await expect(traceStore.addSpans('test-trace-id', spans)).rejects.toThrow('Insert failed');
    });

    it('should skip trace existence checks when skipTraceCheck is true', async () => {
      const spans = [
        {
          spanId: 'span-1',
          name: 'operation-1',
          startTime: 1000,
        },
      ];

      await traceStore.addSpans('test-trace-id', spans, { skipTraceCheck: true });

      expect(mockDb.select).not.toHaveBeenCalled();
      expect(mockDb.insert().values).toHaveBeenCalledWith([
        expect.objectContaining({
          traceId: 'test-trace-id',
          spanId: 'span-1',
          name: 'operation-1',
        }),
      ]);
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

      // Set up the main traces query
      const tracesSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockTraces)),
      };

      // Set up span queries for each trace
      const spanQuery1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans['trace-1'])),
      };
      const spanQuery2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans['trace-2'])),
      };

      // Mock the select calls in sequence: first for traces, then for each trace's spans
      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(tracesSelectChain)
        .mockReturnValueOnce(spanQuery1)
        .mockReturnValueOnce(spanQuery2);

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
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve([mockTrace])),
      };

      // Mock spans query
      const spanQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(traceSelectChain)
        .mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTrace('trace-1');

      expect(result).toEqual({
        ...mockTrace,
        spans: mockSpans,
      });
    });

    it('should return null if trace not found', async () => {
      // Mock trace query - update the select chain to include limit
      const traceSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve([])),
      };
      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValue(traceSelectChain);

      const result = await traceStore.getTrace('non-existent-trace');

      expect(result).toBeNull();
    });
  });

  describe('deleteOldTraces', () => {
    it('should delete traces older than retention period', async () => {
      const retentionDays = 30;
      const now = Date.UTC(2026, 2, 6, 12, 0, 0);
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

      await traceStore.deleteOldTraces(retentionDays);

      expect(mockDb.delete).toHaveBeenCalledWith(expect.anything());
      const whereArg = mockDb.delete().where.mock.calls[0][0];
      const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1000;
      const cutoffTimestamp = new Date(cutoffTime).toISOString().replace('T', ' ').slice(0, 19);
      const stringChunks = whereArg.queryChunks
        .filter((chunk: any) => Array.isArray(chunk?.value))
        .flatMap((chunk: any) => chunk.value)
        .join(' ');

      expect(stringChunks).toContain('typeof(');
      expect(stringChunks).toContain("= 'integer'");
      expect(stringChunks).toContain("= 'text'");
      expect(whereArg.queryChunks).toContain(cutoffTime);
      expect(whereArg.queryChunks).toContain(cutoffTimestamp);

      dateNowSpy.mockRestore();
    });

    it('should handle errors when deleting old traces', async () => {
      const error = new Error('Delete failed');
      mockDb.delete().where.mockRejectedValueOnce(error);

      await expect(traceStore.deleteOldTraces(30)).rejects.toThrow('Delete failed');
    });
  });

  describe('getSpans', () => {
    it('should handle circular parent references without overflowing the stack', async () => {
      const rows = [
        {
          traceId: 'trace-1',
          spanId: 'span-a',
          parentSpanId: 'span-b',
          name: 'span-a',
          startTime: 1000,
          endTime: 1100,
          attributes: {},
          statusCode: null,
          statusMessage: null,
        },
        {
          traceId: 'trace-1',
          spanId: 'span-b',
          parentSpanId: 'span-a',
          name: 'span-b',
          startTime: 1001,
          endTime: 1101,
          attributes: {},
          statusCode: null,
          statusMessage: null,
        },
      ];

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn(() => Promise.resolve(rows)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(selectChain);

      await expect(traceStore.getSpans('trace-1', { maxDepth: 2 })).resolves.toEqual(
        expect.any(Array),
      );
    });

    it('should apply earliest time, filters, maxDepth, maxSpans, and attribute sanitization', async () => {
      const rows = [
        {
          traceId: 'trace-1',
          spanId: 'root',
          parentSpanId: null,
          name: 'root',
          startTime: 1000,
          endTime: 1100,
          attributes: { 'otel.span.kind': 'internal' },
          statusCode: null,
          statusMessage: null,
        },
        {
          traceId: 'trace-1',
          spanId: 'api-request',
          parentSpanId: 'root',
          name: 'claude_code.api_request',
          startTime: 1001,
          endTime: 1101,
          attributes: {
            'otel.span.kind': 'client',
            token: 'secret-token',
            longText: 'x'.repeat(405),
            nested: {
              password: 'p@ssword',
              safe: 'value',
            },
          },
          statusCode: null,
          statusMessage: null,
        },
        {
          traceId: 'trace-1',
          spanId: 'tool-call',
          parentSpanId: 'api-request',
          name: 'claude_code.tool_result',
          startTime: 1002,
          endTime: 1102,
          attributes: {
            'otel.span.kind': 'client',
          },
          statusCode: null,
          statusMessage: null,
        },
      ];

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn(() => Promise.resolve(rows)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(selectChain);

      const spans = await traceStore.getSpans('trace-1', {
        earliestStartTime: 1001,
        includeInternalSpans: false,
        spanFilter: ['api'],
        maxDepth: 2,
        maxSpans: 1,
        sanitizeAttributes: true,
      });

      expect(spans).toEqual([
        {
          spanId: 'api-request',
          parentSpanId: 'root',
          name: 'claude_code.api_request',
          startTime: 1001,
          endTime: 1101,
          attributes: {
            'otel.span.kind': 'client',
            token: '<redacted>',
            longText: `${'x'.repeat(400)}…`,
            nested: {
              password: '<redacted>',
              safe: 'value',
            },
          },
          statusCode: undefined,
          statusMessage: undefined,
        },
      ]);
    });
  });
});
