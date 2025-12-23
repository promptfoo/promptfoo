import { describe, it, expect, vi } from 'vitest';
import { processStreamingResponse } from '../../src/util/fetch';

describe('processStreamingResponse', () => {
  describe('TTFT correctness', () => {
    it('should measure TTFT from request start, not stream start', async () => {
      const requestStartTime = Date.now() - 200; // Simulate 200ms ago

      // Create a mock streaming response with 2 chunks
      const chunks = [
        new TextEncoder().encode('First chunk'),
        new TextEncoder().encode(' Second chunk'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            // Simulate 50ms delay between chunks
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      // CRITICAL: TTFT should include the simulated 200ms network delay
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThan(200);
      // Should be roughly 200ms (network) + 50ms (first chunk delay) = 250ms
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThan(400);

      // Verify TTFT is always less than or equal to total latency
      const totalLatency = Date.now() - requestStartTime;
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThanOrEqual(totalLatency);
    });

    it('should set isActuallyStreaming=true for multi-chunk responses', async () => {
      const requestStartTime = Date.now();

      const chunks = [
        new TextEncoder().encode('Chunk 1'),
        new TextEncoder().encode('Chunk 2'),
        new TextEncoder().encode('Chunk 3'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      expect(result.streamingMetrics.isActuallyStreaming).toBe(true);
      expect(result.text).toBe('Chunk 1Chunk 2Chunk 3');
    });

    it('should set isActuallyStreaming=false for single-chunk responses', async () => {
      const requestStartTime = Date.now() - 10; // Small delay to avoid 0ms TTFT

      const chunks = [new TextEncoder().encode('Complete response in one chunk')];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      expect(result.streamingMetrics.isActuallyStreaming).toBe(false);
      expect(result.text).toBe('Complete response in one chunk');
      // TTFT should still be measured from request start
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(10);
    });

    it('should handle empty chunks and wait for first non-empty chunk', async () => {
      const requestStartTime = Date.now();

      const chunks = [
        new TextEncoder().encode(''), // Empty
        new TextEncoder().encode('   '), // Whitespace only
        new TextEncoder().encode('Content'), // First real content
        new TextEncoder().encode(' More'),
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      // TTFT should trigger on first non-empty trimmed chunk (3rd chunk)
      // Should be at least 30ms (3 chunks × 10ms delay)
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThan(20);
      expect(result.text).toBe('   Content More');
    });

    it('should call onFirstToken callback when first content arrives', async () => {
      const requestStartTime = Date.now();
      const onFirstToken = vi.fn();

      const chunks = [new TextEncoder().encode('First'), new TextEncoder().encode(' Second')];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      await processStreamingResponse(mockResponse, requestStartTime, onFirstToken);

      expect(onFirstToken).toHaveBeenCalledTimes(1);
    });

    it('should include network overhead in TTFT measurement', async () => {
      // Simulate a request that was sent 500ms ago
      const requestStartTime = Date.now() - 500;

      const chunks = [new TextEncoder().encode('Response')];

      let chunkIndex = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (chunkIndex < chunks.length) {
            return { done: false, value: chunks[chunkIndex++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      // TTFT should be at least 500ms (the simulated network delay)
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(500);
      // But not too much more (allow 100ms margin for test execution)
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThan(650);
    });
  });

  describe('Error handling', () => {
    it('should throw error if response body is not readable', async () => {
      const requestStartTime = Date.now();

      const mockResponse = {
        body: null,
      } as unknown as Response;

      await expect(processStreamingResponse(mockResponse, requestStartTime)).rejects.toThrow(
        'Response body is not readable',
      );
    });

    it('should release lock even if reading fails', async () => {
      const requestStartTime = Date.now();

      const mockReader = {
        read: vi.fn(async () => {
          throw new Error('Read failed');
        }),
        releaseLock: vi.fn(),
      };

      const mockResponse = {
        body: {
          getReader: () => mockReader,
        },
      } as unknown as Response;

      await expect(processStreamingResponse(mockResponse, requestStartTime)).rejects.toThrow(
        'Read failed',
      );

      // Verify lock was released despite error
      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });
});
