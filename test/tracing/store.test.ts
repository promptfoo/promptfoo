import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockGlobal } from '../util/utils';

const mockRandomUUID = vi.fn(() => 'test-uuid');
const restoreCrypto = mockGlobal('crypto', {
  ...crypto,
  randomUUID: mockRandomUUID,
} as Crypto);

afterAll(() => {
  restoreCrypto();
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
  let mockDeleteChain: any;

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
      onConflictDoNothing: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue(undefined),
    };
    const mockSelectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(() => Promise.resolve([])),
    };
    mockDeleteChain = {
      where: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      insert: vi.fn(() => mockInsertChain),
      select: vi.fn(() => mockSelectChain),
      delete: vi.fn(() => mockDeleteChain),
      transaction: vi.fn(async (callback) => callback(mockDb)),
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
        createdAt: expect.any(Number),
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
      mockDb.insert().values().onConflictDoNothing().run.mockRejectedValueOnce(error);

      const traceData = {
        traceId: 'test-trace-id',
        evaluationId: 'test-eval-id',
        testCaseId: 'test-case-id',
      };

      await expect(traceStore.createTrace(traceData)).rejects.toThrow('Database error');
    });
  });

  describe('getTraceMetadata', () => {
    // This three-way contract is the single source of truth for ingest-time redaction
    // (otlpReceiver.getRedactAttributePatterns): object => use stored policy, {} => no
    // policy (no redaction), undefined => no trace row (fall back to receiver default).
    it('returns the stored metadata object when the trace row has metadata', async () => {
      mockDb
        .select()
        .from()
        .where()
        .limit.mockResolvedValueOnce([
          { metadata: { otlpHttpRedactAttributes: ['authorization'] } },
        ]);

      await expect(traceStore.getTraceMetadata('trace-1')).resolves.toEqual({
        otlpHttpRedactAttributes: ['authorization'],
      });
    });

    it('returns an empty object (not undefined) when the row exists but metadata is null', async () => {
      mockDb
        .select()
        .from()
        .where()
        .limit.mockResolvedValueOnce([{ metadata: null }]);

      await expect(traceStore.getTraceMetadata('trace-2')).resolves.toEqual({});
    });

    it('returns undefined when no trace row exists', async () => {
      mockDb.select().from().where().limit.mockResolvedValueOnce([]);

      await expect(traceStore.getTraceMetadata('trace-3')).resolves.toBeUndefined();
    });
  });

  describe('addSpans', () => {
    it('ignores existing and repeated spans through the database uniqueness constraint', async () => {
      await traceStore.addSpans(
        'test-trace-id',
        [
          { spanId: 'existing', name: 'existing', startTime: 1 },
          { spanId: 'new', name: 'new', startTime: 2 },
          { spanId: 'new', name: 'duplicate', startTime: 3 },
        ],
        { skipTraceCheck: true },
      );

      expect(mockDb.insert().values).toHaveBeenCalledWith([
        expect.objectContaining({ spanId: 'existing' }),
        expect.objectContaining({ spanId: 'new', name: 'new' }),
        expect.objectContaining({ spanId: 'new', name: 'duplicate' }),
      ]);
      expect(mockDb.insert().values().onConflictDoNothing).toHaveBeenCalledWith(
        expect.objectContaining({ target: expect.any(Array) }),
      );
    });

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
          events: [
            {
              name: 'guardrail decision',
              timestamp: 1500,
              attributes: { 'guardrails.decision': 'blocked' },
            },
          ],
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
          events: [
            {
              name: 'guardrail decision',
              timestamp: 1500,
              attributes: { 'guardrails.decision': 'blocked' },
            },
          ],
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
      mockDb.insert().values().run.mockRejectedValueOnce(error);

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
        { id: '1', traceId: 'trace-1', evaluationId: 'eval-1', testCaseId: 'test-case-1' },
        { id: '2', traceId: 'trace-2', evaluationId: 'eval-1', testCaseId: 'test-case-2' },
      ];

      const mockSpans = {
        'trace-1': [
          {
            id: '1',
            traceId: 'trace-1',
            spanId: 'span-1-1',
            parentSpanId: null,
            name: 'span one',
            startTime: 1000,
            endTime: null,
            attributes: null,
            statusCode: null,
            statusMessage: null,
          },
          {
            id: '2',
            traceId: 'trace-1',
            spanId: 'span-1-2',
            parentSpanId: 'span-1-1',
            name: 'span two',
            startTime: 2000,
            endTime: 2500,
            attributes: { foo: 'bar' },
            statusCode: 1,
            statusMessage: 'ok',
          },
        ],
        'trace-2': [
          {
            id: '3',
            traceId: 'trace-2',
            spanId: 'span-2-1',
            parentSpanId: null,
            name: 'span three',
            startTime: 3000,
            endTime: null,
            attributes: null,
            statusCode: null,
            statusMessage: null,
          },
        ],
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
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: undefined,
        spans: [
          {
            spanId: 'span-1-1',
            parentSpanId: undefined,
            name: 'span one',
            startTime: 1000,
            endTime: undefined,
            attributes: undefined,
            statusCode: undefined,
            statusMessage: undefined,
          },
          {
            spanId: 'span-1-2',
            parentSpanId: 'span-1-1',
            name: 'span two',
            startTime: 2000,
            endTime: 2500,
            attributes: { foo: 'bar' },
            statusCode: 1,
            statusMessage: 'ok',
          },
        ],
      });
      expect(result[1]).toEqual({
        traceId: 'trace-2',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-2',
        metadata: undefined,
        spans: [
          {
            spanId: 'span-2-1',
            parentSpanId: undefined,
            name: 'span three',
            startTime: 3000,
            endTime: undefined,
            attributes: undefined,
            statusCode: undefined,
            statusMessage: undefined,
          },
        ],
      });
    });

    it('should redact sensitive span attributes for an evaluation', async () => {
      const mockTrace = {
        id: '1',
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: null,
      };
      const mockSpans = [
        {
          id: '1',
          traceId: 'trace-1',
          spanId: 'span-1',
          parentSpanId: null,
          name: 'http request',
          startTime: 1000,
          endTime: null,
          attributes: {
            authorization: 'Bearer trace-secret',
            'x-api-key': 'gateway-secret',
            headers: {
              'api-key': 'header-secret',
              set_cookie: 'session=trace-secret',
              accept: 'application/json',
            },
            nested: {
              api_token: 'nested-secret',
              safe: 'ok',
            },
            'gen_ai.request.max_tokens': 4096,
            'gen_ai.usage.input_tokens': 100,
            'gen_ai.usage.output_tokens': 50,
            'gen_ai.usage.total_tokens': 150,
            'llm.usage.prompt_tokens': 100,
            'llm.usage.completion_tokens': 50,
            'llm.usage.total_tokens': 150,
          },
          statusCode: null,
          statusMessage: null,
        },
      ];

      const tracesSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve([mockTrace])),
      };
      const spanQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(tracesSelectChain)
        .mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTracesByEvaluation('eval-1');

      expect(result[0].spans[0].attributes).toEqual({
        authorization: '<redacted>',
        'x-api-key': '<redacted>',
        headers: {
          'api-key': '<redacted>',
          set_cookie: '<redacted>',
          accept: 'application/json',
        },
        nested: {
          api_token: '<redacted>',
          safe: 'ok',
        },
        'gen_ai.request.max_tokens': 4096,
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
        'gen_ai.usage.total_tokens': 150,
        'llm.usage.prompt_tokens': 100,
        'llm.usage.completion_tokens': 50,
        'llm.usage.total_tokens': 150,
      });
    });

    it('should allow callers to retrieve raw span attributes for an evaluation', async () => {
      const mockTrace = {
        id: '1',
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: null,
      };
      const mockSpans = [
        {
          id: '1',
          traceId: 'trace-1',
          spanId: 'span-1',
          parentSpanId: null,
          name: 'http request',
          startTime: 1000,
          endTime: null,
          attributes: {
            authorization: 'Bearer trace-secret',
            'x-api-key': 'gateway-secret',
            headers: {
              'api-key': 'header-secret',
              set_cookie: 'session=trace-secret',
              accept: 'application/json',
            },
          },
          statusCode: null,
          statusMessage: null,
        },
      ];

      const tracesSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve([mockTrace])),
      };
      const spanQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(tracesSelectChain)
        .mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTracesByEvaluation('eval-1', {
        sanitizeAttributes: false,
      });

      expect(result[0].spans[0].attributes).toEqual(mockSpans[0].attributes);
    });

    it('should return empty array if no traces found', async () => {
      mockDb.select().from().where.mockResolvedValueOnce([]);

      const result = await traceStore.getTracesByEvaluation('non-existent-eval');

      expect(result).toEqual([]);
    });
  });

  describe('getTrace', () => {
    it('should retrieve a single trace with spans', async () => {
      const mockTrace = {
        id: '1',
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: { source: 'test' },
      };
      const mockSpans = [
        {
          id: '1',
          traceId: 'trace-1',
          spanId: 'span-1',
          parentSpanId: null,
          name: 'span one',
          startTime: 1000,
          endTime: null,
          attributes: null,
          statusCode: null,
          statusMessage: null,
        },
        {
          id: '2',
          traceId: 'trace-1',
          spanId: 'span-2',
          parentSpanId: 'span-1',
          name: 'span two',
          startTime: 2000,
          endTime: 2500,
          attributes: {
            foo: 'bar',
            authorization: 'Bearer trace-secret',
            headers: {
              Cookie: 'session=trace-secret',
              'x-api-key': 'gateway-secret',
              accept: 'application/json',
            },
            nested: {
              'api-key': 'nested-header-secret',
              api_key: 'nested-secret',
              safe: 'ok',
            },
          },
          events: [
            {
              name: 'tool error Bearer event-secret',
              timestamp: 2250,
              attributes: {
                authorization: 'Bearer event-secret',
                safe: 'ok',
              },
            },
            {
              name: 'echo Bearer trace-secret',
              timestamp: 2260,
              attributes: { safe: 'ok' },
            },
          ],
          statusCode: 1,
          statusMessage: 'ok',
        },
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
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: { source: 'test' },
        spans: [
          {
            spanId: 'span-1',
            parentSpanId: undefined,
            name: 'span one',
            startTime: 1000,
            endTime: undefined,
            attributes: undefined,
            statusCode: undefined,
            statusMessage: undefined,
          },
          {
            spanId: 'span-2',
            parentSpanId: 'span-1',
            name: 'span two',
            startTime: 2000,
            endTime: 2500,
            attributes: {
              foo: 'bar',
              authorization: '<redacted>',
              headers: {
                Cookie: '<redacted>',
                'x-api-key': '<redacted>',
                accept: 'application/json',
              },
              nested: {
                'api-key': '<redacted>',
                api_key: '<redacted>',
                safe: 'ok',
              },
            },
            events: [
              {
                name: 'tool error <redacted>',
                timestamp: 2250,
                attributes: {
                  authorization: '<redacted>',
                  safe: 'ok',
                },
              },
              {
                name: 'echo <redacted>',
                timestamp: 2260,
                attributes: { safe: 'ok' },
              },
            ],
            statusCode: 1,
            statusMessage: 'ok',
          },
        ],
      });
    });

    it.each(['getTrace', 'getTracesByEvaluation', 'getSpans'] as const)(
      'redacts sibling span and event echoes in %s',
      async (method) => {
        const secret = 'PRIVATE_SIBLING_EVENT_SECRET';
        const rows = [
          { spanId: 'source', name: 'source', startTime: 1, attributes: { authorization: secret } },
          {
            spanId: 'echo',
            name: `span ${secret}`,
            startTime: 2,
            attributes: {},
            events: [{ name: `event ${secret}`, timestamp: 3, attributes: {} }],
          },
        ];
        const query = (value: unknown, chain = false) => ({
          from: vi.fn().mockReturnThis(),
          where: chain ? vi.fn().mockReturnThis() : vi.fn().mockResolvedValue(value),
          limit: vi.fn().mockResolvedValue(value),
          orderBy: vi.fn().mockResolvedValue(value),
        });
        if (method !== 'getSpans') {
          mockDb.select.mockReturnValueOnce(
            query([{ traceId: 'siblings' }], method === 'getTrace'),
          );
        }
        mockDb.select.mockReturnValueOnce(query(rows, method === 'getSpans'));
        expect(JSON.stringify(await traceStore[method]('siblings'))).not.toContain(secret);
      },
    );

    it.each([true, false])(
      'redacts text when %s event attributes exceed the depth limit',
      async (eventAttributes) => {
        const secret = 'PRIVATE_DEEP_STORED_VALUE';
        let nested: Record<string, unknown> = { authorization: secret };
        for (let i = 0; i < 25; i++) {
          nested = { nested };
        }
        mockDb.select
          .mockReturnValueOnce({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([{ traceId: 'deep-stored' }]),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([
              {
                spanId: 'span',
                name: secret,
                statusMessage: secret,
                startTime: 1,
                attributes: eventAttributes ? {} : nested,
                events: [{ name: secret, timestamp: 2, attributes: eventAttributes ? nested : {} }],
              },
            ]),
          });
        expect(JSON.stringify(await traceStore.getTrace('deep-stored'))).not.toContain(secret);
      },
    );

    it.each([true, false])(
      'redacts overlapping span and event secrets together: %s',
      async (longerInEvent) => {
        const short = 'SYNTHETIC_SHORT_SECRET';
        const long = `prefix-${short}-suffix`;
        const spans = [
          {
            spanId: 'span-overlap',
            name: long,
            startTime: 0,
            statusMessage: long,
            attributes: { authorization: longerInEvent ? short : long },
            events: [
              { name: long, timestamp: 0, attributes: { api_key: longerInEvent ? long : short } },
            ],
          },
        ];
        mockDb.select
          .mockReturnValueOnce({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([{ traceId: 'trace-overlap' }]),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue(spans),
          });
        const result = await traceStore.getTrace('trace-overlap');
        expect(result?.spans[0]).toMatchObject({
          name: '<redacted>',
          statusMessage: '<redacted>',
          events: [{ name: '<redacted>', attributes: { api_key: '<redacted>' } }],
        });
      },
    );

    it('replaces repeated short secrets without expanding redaction markers', async () => {
      mockDb.select
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue([{ traceId: 'duplicate-secrets' }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([
            {
              spanId: 'span',
              name: 'e',
              startTime: 0,
              statusMessage: 'e',
              attributes: Object.fromEntries(
                Array.from({ length: 12 }, (_, i) => [`token${i}`, 'e']),
              ),
              events: [{ name: 'e', timestamp: 0, attributes: { token: 'e' } }],
            },
          ]),
        });
      const result = await traceStore.getTrace('duplicate-secrets');
      expect(result?.spans[0].name).toHaveLength('<redacted>'.length);
      expect(result?.spans[0]).toMatchObject({
        name: '<redacted>',
        statusMessage: '<redacted>',
        events: [{ name: '<redacted>' }],
      });
    });

    it('should allow callers to retrieve raw span attributes for a single trace', async () => {
      const mockTrace = {
        id: '1',
        traceId: 'trace-1',
        evaluationId: 'eval-1',
        testCaseId: 'test-case-1',
        metadata: null,
      };
      const mockSpans = [
        {
          id: '1',
          traceId: 'trace-1',
          spanId: 'span-1',
          parentSpanId: null,
          name: 'tool call',
          startTime: 1000,
          endTime: null,
          attributes: {
            api_key: 'trace-aware-assertion-secret',
            token: 'trace-aware-token',
            arguments: { api_key: 'nested-secret' },
          },
          statusCode: null,
          statusMessage: null,
        },
      ];

      const traceSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve([mockTrace])),
      };
      const spanQuery = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn(() => Promise.resolve(mockSpans)),
      };

      vi.spyOn(mockDb, 'select')
        .mockImplementation(() => ({}))
        .mockReturnValueOnce(traceSelectChain)
        .mockReturnValueOnce(spanQuery);

      const result = await traceStore.getTrace('trace-1', { sanitizeAttributes: false });

      expect(result?.spans[0].attributes).toEqual(mockSpans[0].attributes);
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
    it('should delete dependent spans before traces older than retention period', async () => {
      const retentionDays = 30;

      await traceStore.deleteOldTraces(retentionDays);

      expect(mockDb.transaction).toHaveBeenCalledWith(expect.any(Function));
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
      expect(mockDeleteChain.where).toHaveBeenCalledTimes(2);
      expect(mockDeleteChain.run).toHaveBeenCalledTimes(2);
    });

    it('should handle errors when deleting old traces', async () => {
      const error = new Error('Delete failed');
      mockDeleteChain.run.mockRejectedValueOnce(error);

      await expect(traceStore.deleteOldTraces(30)).rejects.toThrow('Delete failed');
    });
  });
});
