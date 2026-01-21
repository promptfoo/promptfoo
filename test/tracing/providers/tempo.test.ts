import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetchWithCache before importing TempoProvider
vi.mock('../../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { fetchWithCache } from '../../../src/cache';
import { TempoProvider } from '../../../src/tracing/providers/tempo';

const mockedFetchWithCache = vi.mocked(fetchWithCache);

describe('TempoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should throw if endpoint is not provided', () => {
      expect(() => new TempoProvider({ id: 'tempo' })).toThrow(
        'Tempo provider requires endpoint configuration',
      );
    });

    it('should create provider with endpoint', () => {
      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      expect(provider.id).toBe('tempo');
    });

    it('should strip trailing slash from endpoint', () => {
      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200/' });
      expect(provider.id).toBe('tempo');
    });
  });

  describe('fetchTrace', () => {
    const mockTempoResponse = {
      batches: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'my-instrumentation' },
              spans: [
                {
                  traceId: 'abc123',
                  spanId: 'span1',
                  name: 'test-span',
                  startTimeUnixNano: '1704067200000000000', // 2024-01-01 00:00:00 UTC
                  endTimeUnixNano: '1704067201000000000', // 1 second later
                  attributes: [
                    { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
                    { key: 'gen_ai.request.model', value: { stringValue: 'gpt-4' } },
                  ],
                  status: { code: 1, message: 'OK' },
                },
                {
                  traceId: 'abc123',
                  spanId: 'span2',
                  parentSpanId: 'span1',
                  name: 'child-span',
                  startTimeUnixNano: '1704067200100000000',
                  endTimeUnixNano: '1704067200500000000',
                  attributes: [{ key: 'tool.name', value: { stringValue: 'search' } }],
                },
              ],
            },
          ],
        },
      ],
    };

    it('should fetch trace successfully', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: mockTempoResponse,
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123');

      expect(result).not.toBeNull();
      expect(result!.traceId).toBe('abc123');
      expect(result!.spans).toHaveLength(2);
      expect(result!.services).toContain('test-service');

      // Check span transformation (spanIds are lowercased)
      const parentSpan = result!.spans.find((s) => s.name === 'test-span');
      expect(parentSpan).toBeDefined();
      expect(parentSpan!.attributes!['gen_ai.operation.name']).toBe('chat');
      expect(parentSpan!.attributes!['gen_ai.request.model']).toBe('gpt-4');
      expect(parentSpan!.statusCode).toBe(1);

      const childSpan = result!.spans.find((s) => s.name === 'child-span');
      expect(childSpan).toBeDefined();
      expect(childSpan!.attributes!['tool.name']).toBe('search');
    });

    it('should return null when trace is not found (404)', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        data: {},
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null on unexpected status codes', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        data: {},
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123');

      expect(result).toBeNull();
    });

    it('should return null on fetch error', async () => {
      mockedFetchWithCache.mockRejectedValue(new Error('Network error'));

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123');

      expect(result).toBeNull();
    });

    it('should apply maxSpans limit', async () => {
      const manySpansResponse = {
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                spans: Array.from({ length: 100 }, (_, i) => ({
                  traceId: 'abc123',
                  spanId: `span${i}`,
                  name: `span-${i}`,
                  startTimeUnixNano: '1704067200000000000',
                })),
              },
            ],
          },
        ],
      };

      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: manySpansResponse,
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123', { maxSpans: 10 });

      expect(result).not.toBeNull();
      expect(result!.spans).toHaveLength(10);
    });

    it('should apply span name filter', async () => {
      const mixedSpansResponse = {
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                spans: [
                  { traceId: 'abc123', spanId: 's1', name: 'llm.chat', startTimeUnixNano: '1' },
                  { traceId: 'abc123', spanId: 's2', name: 'http.request', startTimeUnixNano: '1' },
                  {
                    traceId: 'abc123',
                    spanId: 's3',
                    name: 'llm.completion',
                    startTimeUnixNano: '1',
                  },
                ],
              },
            ],
          },
        ],
      };

      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: mixedSpansResponse,
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123', { spanFilter: ['llm.*'] });

      expect(result).not.toBeNull();
      expect(result!.spans).toHaveLength(2);
      expect(result!.spans.every((s) => s.name.startsWith('llm.'))).toBe(true);
    });

    it('should apply earliestStartTime filter', async () => {
      // Timestamps in nanoseconds -> milliseconds
      // 1,000,000 ns = 1ms, 5,000,000 ns = 5ms (1 ms = 1,000,000 ns)
      const timestampedSpansResponse = {
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123def456',
                    spanId: 'aabbccdd11223344', // Valid hex
                    name: 'early',
                    startTimeUnixNano: '1000000', // 1ms
                  },
                  {
                    traceId: 'abc123def456',
                    spanId: 'eeff00112233aabb', // Valid hex
                    name: 'late',
                    startTimeUnixNano: '5000000', // 5ms
                  },
                ],
              },
            ],
          },
        ],
      };

      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: timestampedSpansResponse,
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      // Filter for spans starting at 3ms or later (only 'late' at 5ms should match)
      const result = await provider.fetchTrace('abc123def456', { earliestStartTime: 3 });

      expect(result).not.toBeNull();
      expect(result!.spans).toHaveLength(1);
      expect(result!.spans[0].name).toBe('late');
    });

    it('should include auth headers when token is configured', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: { batches: [] },
        cached: false,
      });

      const provider = new TempoProvider({
        id: 'tempo',
        endpoint: 'http://tempo:3200',
        auth: { token: 'my-secret-token' },
      });
      await provider.fetchTrace('abc123');

      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        'http://tempo:3200/api/traces/abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-secret-token',
          }),
        }),
        10000,
        'json',
        true,
      );
    });

    it('should include basic auth headers when username/password configured', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: { batches: [] },
        cached: false,
      });

      const provider = new TempoProvider({
        id: 'tempo',
        endpoint: 'http://tempo:3200',
        auth: { username: 'user', password: 'pass' },
      });
      await provider.fetchTrace('abc123');

      const expectedAuth = Buffer.from('user:pass').toString('base64');
      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        'http://tempo:3200/api/traces/abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        }),
        10000,
        'json',
        true,
      );
    });

    it('should include custom headers', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: { batches: [] },
        cached: false,
      });

      const provider = new TempoProvider({
        id: 'tempo',
        endpoint: 'http://tempo:3200',
        headers: { 'X-Custom-Header': 'custom-value' },
      });
      await provider.fetchTrace('abc123');

      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        'http://tempo:3200/api/traces/abc123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        }),
        10000,
        'json',
        true,
      );
    });

    it('should use custom timeout', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: { batches: [] },
        cached: false,
      });

      const provider = new TempoProvider({
        id: 'tempo',
        endpoint: 'http://tempo:3200',
        timeout: 30000,
      });
      await provider.fetchTrace('abc123');

      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        30000, // custom timeout
        'json',
        true,
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when Tempo is ready', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: 'ready',
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        'http://tempo:3200/ready',
        expect.any(Object),
        5000,
        'text',
        true,
      );
    });

    it('should return false when Tempo is not ready', async () => {
      mockedFetchWithCache.mockResolvedValue({
        status: 503,
        statusText: 'Service Unavailable',
        data: '',
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockedFetchWithCache.mockRejectedValue(new Error('Connection refused'));

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('attribute transformation', () => {
    it('should handle different attribute value types', async () => {
      const attributeTypesResponse = {
        batches: [
          {
            resource: { attributes: [] },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 's1',
                    name: 'test',
                    startTimeUnixNano: '1',
                    attributes: [
                      { key: 'str', value: { stringValue: 'hello' } },
                      { key: 'int', value: { intValue: '42' } },
                      { key: 'double', value: { doubleValue: 3.14 } },
                      { key: 'bool', value: { boolValue: true } },
                      {
                        key: 'array',
                        value: {
                          arrayValue: { values: [{ stringValue: 'a' }, { stringValue: 'b' }] },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      mockedFetchWithCache.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        data: attributeTypesResponse,
        cached: false,
      });

      const provider = new TempoProvider({ id: 'tempo', endpoint: 'http://tempo:3200' });
      const result = await provider.fetchTrace('abc123');

      expect(result).not.toBeNull();
      const span = result!.spans[0];
      expect(span.attributes!.str).toBe('hello');
      expect(span.attributes!.int).toBe(42);
      expect(span.attributes!.double).toBe(3.14);
      expect(span.attributes!.bool).toBe(true);
      expect(span.attributes!.array).toEqual(['a', 'b']);
    });
  });
});
