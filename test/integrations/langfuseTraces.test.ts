import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock the envars module
vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn(),
  isCI: vi.fn().mockReturnValue(true),
}));

// Mock the langfuse package with hoisted mocks
const mockFetchTraces = vi.hoisted(() => vi.fn());
const mockShutdownAsync = vi.hoisted(() => vi.fn());

vi.mock('langfuse', () => ({
  Langfuse: class MockLangfuse {
    fetchTraces = mockFetchTraces;
    shutdownAsync = mockShutdownAsync;
  },
}));

// Import after mocks are set up
import { getEnvString } from '../../src/envars';
import {
  fetchLangfuseTraces,
  parseTracesUrl,
  shutdownLangfuse,
} from '../../src/integrations/langfuseTraces';

describe('langfuseTraces', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset mocks to ensure test isolation
    mockFetchTraces.mockReset();
    mockShutdownAsync.mockReset();
    vi.mocked(getEnvString).mockReset();
    // Shutdown any existing langfuse instance to reset singleton state
    await shutdownLangfuse();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('parseTracesUrl', () => {
    it('should parse URL with no parameters', () => {
      const result = parseTracesUrl('langfuse://traces');
      expect(result).toEqual({});
    });

    it('should parse URL with empty query string', () => {
      const result = parseTracesUrl('langfuse://traces?');
      expect(result).toEqual({});
    });

    it('should parse limit parameter', () => {
      const result = parseTracesUrl('langfuse://traces?limit=50');
      expect(result.limit).toBe(50);
    });

    it('should cap limit at maximum', () => {
      const result = parseTracesUrl('langfuse://traces?limit=5000');
      expect(result.limit).toBe(1000);
    });

    it('should throw on invalid limit', () => {
      expect(() => parseTracesUrl('langfuse://traces?limit=abc')).toThrow('Invalid limit');
      expect(() => parseTracesUrl('langfuse://traces?limit=-1')).toThrow('Invalid limit');
      expect(() => parseTracesUrl('langfuse://traces?limit=0')).toThrow('Invalid limit');
    });

    it('should parse userId parameter', () => {
      const result = parseTracesUrl('langfuse://traces?userId=user_123');
      expect(result.userId).toBe('user_123');
    });

    it('should parse sessionId parameter', () => {
      const result = parseTracesUrl('langfuse://traces?sessionId=session_456');
      expect(result.sessionId).toBe('session_456');
    });

    it('should parse tags parameter', () => {
      const result = parseTracesUrl('langfuse://traces?tags=production,gpt-4');
      expect(result.tags).toBe('production,gpt-4');
    });

    it('should parse name parameter', () => {
      const result = parseTracesUrl('langfuse://traces?name=chat-completion');
      expect(result.name).toBe('chat-completion');
    });

    it('should parse timestamp parameters', () => {
      const result = parseTracesUrl(
        'langfuse://traces?fromTimestamp=2024-01-01T00:00:00Z&toTimestamp=2024-01-31T23:59:59Z',
      );
      expect(result.fromTimestamp).toBe('2024-01-01T00:00:00Z');
      expect(result.toTimestamp).toBe('2024-01-31T23:59:59Z');
    });

    it('should parse version and release parameters', () => {
      const result = parseTracesUrl('langfuse://traces?version=1.0&release=v2.0.0');
      expect(result.version).toBe('1.0');
      expect(result.release).toBe('v2.0.0');
    });

    it('should parse multiple parameters', () => {
      const result = parseTracesUrl(
        'langfuse://traces?limit=100&userId=user_123&tags=production&name=test',
      );
      expect(result).toEqual({
        limit: 100,
        userId: 'user_123',
        tags: 'production',
        name: 'test',
      });
    });
  });

  describe('fetchLangfuseTraces', () => {
    beforeEach(() => {
      // Set up default env mocks for authentication
      vi.mocked(getEnvString).mockImplementation((key: string) => {
        if (key === 'LANGFUSE_PUBLIC_KEY') {
          return 'pk-test';
        }
        if (key === 'LANGFUSE_SECRET_KEY') {
          return 'sk-test';
        }
        if (key === 'LANGFUSE_BASE_URL' || key === 'LANGFUSE_HOST') {
          return 'https://cloud.langfuse.com';
        }
        return '';
      });
    });

    it('should throw error when credentials are missing', async () => {
      vi.mocked(getEnvString).mockReturnValue('');

      await expect(fetchLangfuseTraces('langfuse://traces')).rejects.toThrow(
        'Langfuse credentials not configured',
      );
    });

    it('should fetch traces and convert to test cases', async () => {
      const mockTraces = [
        {
          id: 'trace-1',
          timestamp: '2024-01-15T10:00:00Z',
          name: 'chat-completion',
          input: { query: 'What is the capital of France?' },
          output: { response: 'Paris is the capital of France.' },
          userId: 'user_123',
          sessionId: 'session_456',
          tags: ['production', 'geography'],
          metadata: { category: 'geography' },
          htmlPath: '/project/123/traces/trace-1',
          latency: 0.5,
          totalCost: 0.001,
        },
      ];

      mockFetchTraces.mockResolvedValueOnce({
        data: mockTraces,
        meta: { page: 1, limit: 100, totalItems: 1, totalPages: 1 },
      });

      const tests = await fetchLangfuseTraces('langfuse://traces?limit=10');

      expect(mockFetchTraces).toHaveBeenCalledWith({
        limit: 10,
        page: 1,
      });

      expect(tests).toHaveLength(1);
      expect(tests[0]).toMatchObject({
        description: expect.stringContaining('chat-completion'),
        vars: {
          __langfuse_trace_id: 'trace-1',
          __langfuse_input: { query: 'What is the capital of France?' },
          __langfuse_output: { response: 'Paris is the capital of France.' },
          __langfuse_user_id: 'user_123',
          __langfuse_session_id: 'session_456',
          __langfuse_tags: ['production', 'geography'],
          input: 'What is the capital of France?',
          output: 'Paris is the capital of France.',
        },
        metadata: {
          langfuseTraceId: 'trace-1',
          langfuseTraceUrl: 'https://cloud.langfuse.com/project/123/traces/trace-1',
        },
        options: {
          disableVarExpansion: true,
        },
        providerOutput: {
          output: 'Paris is the capital of France.',
          cost: 0.001,
          latency: 500,
        },
      });
    });

    it('should handle traces with string input/output directly', async () => {
      mockFetchTraces.mockResolvedValueOnce({
        data: [
          {
            id: 'trace-2',
            timestamp: '2024-01-15T10:00:00Z',
            input: 'Simple string input',
            output: 'Simple string output',
          },
        ],
      });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      expect(tests[0].vars).toMatchObject({
        input: 'Simple string input',
        output: 'Simple string output',
      });
    });

    it('should handle traces with various input object formats', async () => {
      mockFetchTraces.mockResolvedValueOnce({
        data: [
          {
            id: 'trace-prompt',
            timestamp: '2024-01-15T10:00:00Z',
            input: { prompt: 'Using prompt key' },
            output: { result: 'Using result key' },
          },
        ],
      });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      expect(tests[0].vars?.input).toBe('Using prompt key');
      expect(tests[0].vars?.output).toBe('Using result key');
    });

    it('should pass filter parameters to fetchTraces', async () => {
      mockFetchTraces.mockResolvedValueOnce({ data: [] });

      await fetchLangfuseTraces(
        'langfuse://traces?userId=user_123&sessionId=sess_456&tags=prod&name=test',
      );

      expect(mockFetchTraces).toHaveBeenCalledWith({
        limit: 100,
        page: 1,
        userId: 'user_123',
        sessionId: 'sess_456',
        tags: 'prod',
        name: 'test',
      });
    });

    it('should handle empty response', async () => {
      mockFetchTraces.mockResolvedValueOnce({ data: [] });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      expect(tests).toHaveLength(0);
    });

    it('should paginate through multiple pages', async () => {
      // First page
      mockFetchTraces.mockResolvedValueOnce({
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `trace-${i}`,
            timestamp: '2024-01-15T10:00:00Z',
            input: `Input ${i}`,
            output: `Output ${i}`,
          })),
        meta: { page: 1, limit: 100, totalItems: 150, totalPages: 2 },
      });

      // Second page
      mockFetchTraces.mockResolvedValueOnce({
        data: Array(50)
          .fill(null)
          .map((_, i) => ({
            id: `trace-${100 + i}`,
            timestamp: '2024-01-15T10:00:00Z',
            input: `Input ${100 + i}`,
            output: `Output ${100 + i}`,
          })),
        meta: { page: 2, limit: 100, totalItems: 150, totalPages: 2 },
      });

      const tests = await fetchLangfuseTraces('langfuse://traces?limit=150');

      expect(mockFetchTraces).toHaveBeenCalledTimes(2);
      expect(tests).toHaveLength(150);
    });

    it('should respect limit when paginating', async () => {
      mockFetchTraces.mockResolvedValueOnce({
        data: Array(100)
          .fill(null)
          .map((_, i) => ({
            id: `trace-${i}`,
            timestamp: '2024-01-15T10:00:00Z',
            input: `Input ${i}`,
            output: `Output ${i}`,
          })),
        meta: { page: 1, limit: 100, totalItems: 500, totalPages: 5 },
      });

      const tests = await fetchLangfuseTraces('langfuse://traces?limit=50');

      expect(mockFetchTraces).toHaveBeenCalledTimes(1);
      expect(mockFetchTraces).toHaveBeenCalledWith({
        limit: 50,
        page: 1,
      });
      expect(tests).toHaveLength(50);
    });

    it('should handle traces without output for assertion-only mode', async () => {
      mockFetchTraces.mockResolvedValueOnce({
        data: [
          {
            id: 'trace-no-output',
            timestamp: '2024-01-15T10:00:00Z',
            input: 'Some input',
            output: null,
          },
        ],
      });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      expect(tests[0].providerOutput).toBeUndefined();
    });

    it('should handle traces with complex nested output', async () => {
      mockFetchTraces.mockResolvedValueOnce({
        data: [
          {
            id: 'trace-complex',
            timestamp: '2024-01-15T10:00:00Z',
            input: { messages: [{ role: 'user', content: 'Hello' }] },
            output: { choices: [{ message: { content: 'Hi there!' } }] },
          },
        ],
      });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      // When output doesn't match known patterns, it should use the whole object
      expect(tests[0].vars?.__langfuse_output).toEqual({
        choices: [{ message: { content: 'Hi there!' } }],
      });
      // providerOutput should stringify complex objects
      expect(tests[0].providerOutput?.output).toBe(
        JSON.stringify({ choices: [{ message: { content: 'Hi there!' } }] }),
      );
    });

    it('should use LANGFUSE_HOST as fallback for base URL', async () => {
      vi.mocked(getEnvString).mockImplementation((key: string) => {
        if (key === 'LANGFUSE_PUBLIC_KEY') {
          return 'pk-test';
        }
        if (key === 'LANGFUSE_SECRET_KEY') {
          return 'sk-test';
        }
        if (key === 'LANGFUSE_HOST') {
          return 'https://custom.langfuse.com';
        }
        return '';
      });

      mockFetchTraces.mockResolvedValueOnce({
        data: [
          {
            id: 'trace-1',
            timestamp: '2024-01-15T10:00:00Z',
            htmlPath: '/project/123/traces/trace-1',
          },
        ],
      });

      const tests = await fetchLangfuseTraces('langfuse://traces');

      expect(tests[0].metadata?.langfuseTraceUrl).toBe(
        'https://custom.langfuse.com/project/123/traces/trace-1',
      );
    });
  });
});
