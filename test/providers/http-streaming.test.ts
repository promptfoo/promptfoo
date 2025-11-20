import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HttpProvider } from '../../src/providers/http';
import * as fetchModule from '../../src/util/fetch';

describe('HttpProvider streaming integration', () => {
  let _originalFetchWithRetries: typeof fetchModule.fetchWithRetries;

  beforeEach(() => {
    _originalFetchWithRetries = fetchModule.fetchWithRetries;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TTFT measurement', () => {
    it('should measure TTFT correctly for streaming responses', async () => {
      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: true, // Enable streaming
          },
        },
      });

      // Mock streaming response
      const mockChunks = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < mockChunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return {
              done: false,
              value: new TextEncoder().encode(mockChunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const startTime = Date.now();
      const result = await provider.callApi('Test prompt');
      const totalTime = Date.now() - startTime;

      // Verify streaming metrics exist
      expect(result.streamingMetrics).toBeDefined();
      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      expect(result.streamingMetrics?.totalStreamTime).toBeDefined();
      expect(result.streamingMetrics?.isActuallyStreaming).toBe(true);

      // TTFT should be less than total latency
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThanOrEqual(result.latencyMs!);
      expect(result.latencyMs).toBeLessThanOrEqual(totalTime + 50); // Allow margin

      // TTFT should include network time (at least first chunk delay of 50ms)
      expect(result.streamingMetrics?.timeToFirstToken).toBeGreaterThanOrEqual(40);

      // Response should be cached=false for streaming
      expect(result.cached).toBe(false);
    });

    it('should handle non-streaming responses without streaming metrics', async () => {
      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: false, // No streaming
          },
        },
      });

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Hello world' } }],
          }),
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt');

      // No streaming metrics for non-streaming responses
      expect(result.streamingMetrics).toBeUndefined();

      // Should still have latencyMs
      expect(result.latencyMs).toBeDefined();
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should correctly identify single-chunk pseudo-streaming', async () => {
      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: true, // Streaming enabled
          },
        },
      });

      // Server sends complete response in one chunk (not really streaming)
      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Complete response"}}]}\n\ndata: [DONE]\n\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < mockChunks.length) {
            return {
              done: false,
              value: new TextEncoder().encode(mockChunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt');

      // Should have streaming metrics
      expect(result.streamingMetrics).toBeDefined();

      // But isActuallyStreaming should be false (single chunk)
      expect(result.streamingMetrics?.isActuallyStreaming).toBe(false);

      // TTFT and latencyMs should be similar for single-chunk
      expect(Math.abs(result.streamingMetrics!.timeToFirstToken! - result.latencyMs!)).toBeLessThan(
        50,
      );
    });

    it('should ensure TTFT is always <= latencyMs', async () => {
      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: true,
          },
        },
      });

      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"B"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"C"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < mockChunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return {
              done: false,
              value: new TextEncoder().encode(mockChunks[chunkIndex++]),
            };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await provider.callApi('Test prompt');

      // Critical invariant: TTFT must be <= total latency
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThanOrEqual(result.latencyMs!);

      // TTFT should be roughly 25ms (first chunk delay)
      // latencyMs should be roughly 100ms (4 chunks × 25ms)
      expect(result.streamingMetrics?.timeToFirstToken).toBeGreaterThanOrEqual(20);
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThan(60);
      expect(result.latencyMs).toBeGreaterThanOrEqual(90);
      expect(result.latencyMs).toBeLessThan(150);
    });
  });
});
