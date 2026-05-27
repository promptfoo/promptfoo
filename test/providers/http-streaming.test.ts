import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpProvider } from '../../src/providers/http';
import * as fetchModule from '../../src/util/fetch';

async function settlePendingTimers<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

describe('HttpProvider streaming integration', () => {
  let _originalFetchWithRetries: typeof fetchModule.fetchWithRetries;

  beforeEach(() => {
    _originalFetchWithRetries = fetchModule.fetchWithRetries;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('TTFT measurement', () => {
    it('should measure TTFT correctly for streaming responses', async () => {
      vi.useFakeTimers();

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
          transformResponse: `(_json, _text) => 'Hello world'`,
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
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  done: false,
                  value: new TextEncoder().encode(mockChunks[chunkIndex++]),
                });
              }, 50);
            });
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
      const result = await settlePendingTimers(provider.callApi('Test prompt'));
      const totalTime = Date.now() - startTime;

      // Verify streaming metrics exist
      expect(result.streamingMetrics).toBeDefined();
      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      expect(result.streamingMetrics?.totalStreamTime).toBeDefined();
      expect(result.streamingMetrics?.multiChunkDelivery).toBe(true);

      // TTFT should be less than total latency
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThanOrEqual(result.latencyMs!);
      expect(result.latencyMs).toBeLessThanOrEqual(totalTime + 50); // Allow margin

      // TTFT should include network time (at least first chunk delay of 50ms)
      expect(result.streamingMetrics?.timeToFirstToken).toBeGreaterThanOrEqual(40);

      // completionChars is the raw chars measurement (no chars/4 heuristic).
      // Let callers compute their own rate with their own tokenizer.
      expect(result.streamingMetrics?.completionChars).toBe((result.output as string).length);

      // Response should be cached=false for streaming
      expect(result.cached).toBe(false);
    });

    it('does not infer completion metrics from an untransformed framed stream', async () => {
      vi.useFakeTimers();

      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { stream: true },
        },
      });

      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < mockChunks.length) {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({ done: false, value: new TextEncoder().encode(mockChunks[i++]) });
              }, 30);
            });
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await settlePendingTimers(provider.callApi('Test'));

      expect(result.output).toContain('data:');
      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      expect(result.streamingMetrics?.completionChars).toBeUndefined();
      expect(result.streamingMetrics?.tokensPerSecond).toBeUndefined();
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

      // But multiChunkDelivery should be false (single chunk)
      expect(result.streamingMetrics?.multiChunkDelivery).toBe(false);

      // TTFT and latencyMs should be similar for single-chunk
      expect(Math.abs(result.streamingMetrics!.timeToFirstToken! - result.latencyMs!)).toBeLessThan(
        50,
      );
    });

    it('should ensure TTFT is always <= latencyMs', async () => {
      vi.useFakeTimers();

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
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  done: false,
                  value: new TextEncoder().encode(mockChunks[chunkIndex++]),
                });
              }, 25);
            });
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

      const result = await settlePendingTimers(provider.callApi('Test prompt'));

      // Critical invariant: TTFT must be <= total latency
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThanOrEqual(result.latencyMs!);

      // TTFT should be roughly 25ms (first chunk delay)
      // latencyMs should be roughly 100ms (4 chunks × 25ms)
      expect(result.streamingMetrics?.timeToFirstToken).toBeGreaterThanOrEqual(20);
      expect(result.streamingMetrics?.timeToFirstToken).toBeLessThan(60);
      expect(result.latencyMs).toBeGreaterThanOrEqual(90);
      expect(result.latencyMs).toBeLessThan(150);
    });

    it('rejects a malformed streamFirstTokenPattern at construction (fail fast)', () => {
      // Compile the regex in the constructor so users get a synchronous
      // error at config load, not a silent failure mid-eval or a crash
      // on the first request.
      expect(
        () =>
          new HttpProvider('https://api.example.com/chat', {
            config: {
              method: 'POST',
              body: { stream: true },
              // Unmatched character class: invalid RegExp.
              streamFirstTokenPattern: '(',
            },
          }),
      ).toThrow(/Invalid regular expression/);
    });

    it('accepts a valid streamFirstTokenPattern at construction', () => {
      expect(
        () =>
          new HttpProvider('https://api.example.com/chat', {
            config: {
              method: 'POST',
              body: { stream: true },
              streamFirstTokenPattern: '"delta":\\s*\\{[^}]*"content":"[^"]',
            },
          }),
      ).not.toThrow();
    });

    it('leaves completionChars undefined when transformResponse returns non-string without .output', async () => {
      vi.useFakeTimers();

      // Regression pin: if a user's transformResponse returns e.g. a tool-call
      // object with no `.output` key, we should NOT report the raw SSE buffer
      // length as completionChars — that would be off by 20-60x and mislead
      // assertions that use the value. Leave it undefined instead.
      const provider = new HttpProvider('https://api.example.com/chat', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            model: 'gpt-4',
            messages: [{ role: 'user', content: '{{prompt}}' }],
            stream: true,
          },
          transformResponse: `(json, text) => ({ tokenUsage: { total: 10 } })`, // no .output
        },
      });

      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"X"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Y"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < mockChunks.length) {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({ done: false, value: new TextEncoder().encode(mockChunks[i++]) });
              }, 10);
            });
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await settlePendingTimers(provider.callApi('Test'));

      expect(result.streamingMetrics).toBeDefined();
      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      // Ambiguous completion text → honest undefined, not raw SSE length.
      expect(result.streamingMetrics?.completionChars).toBeUndefined();
      expect(result.streamingMetrics?.tokensPerSecond).toBeUndefined();
    });

    it('leaves raw-request throughput undefined when transformResponse has no definite output', async () => {
      vi.useFakeTimers();

      // Raw request mode should use the same strict parsed-output semantics
      // as body mode. Falling back to raw SSE text would report throughput
      // from framing bytes instead of completion content.
      const provider = new HttpProvider('https://api.example.com', {
        config: {
          request: [
            'POST /chat HTTP/1.1',
            'Host: api.example.com',
            'Content-Type: application/json',
            '',
            '{"stream":true,"prompt":"{{prompt}}"}',
          ].join('\n'),
          transformResponse: `(json, text) => ({ tokenUsage: { total: 10 } })`, // no .output
        },
      });

      const mockChunks = [
        'data: {"choices":[{"delta":{"content":"X"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Y"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < mockChunks.length) {
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve({ done: false, value: new TextEncoder().encode(mockChunks[i++]) });
              }, 30);
            });
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: { getReader: () => mockReader },
      } as unknown as Response;

      vi.spyOn(fetchModule, 'fetchWithRetries').mockResolvedValue(mockResponse);

      const result = await settlePendingTimers(provider.callApi('Test'));

      expect(result.streamingMetrics).toBeDefined();
      expect(result.streamingMetrics?.timeToFirstToken).toBeDefined();
      expect(result.streamingMetrics?.multiChunkDelivery).toBe(true);
      expect(result.streamingMetrics?.totalStreamTime).toBeGreaterThanOrEqual(50);
      expect(result.streamingMetrics?.completionChars).toBeUndefined();
      expect(result.streamingMetrics?.tokensPerSecond).toBeUndefined();
    });
  });
});
