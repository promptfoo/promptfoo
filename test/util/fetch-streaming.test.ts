import { describe, expect, it, vi } from 'vitest';
import {
  detectorForStreamFormat,
  estimateStreamingTokensPerSecond,
  firstNonWhitespaceByteDetector,
  MIN_MEANINGFUL_STREAM_WINDOW_MS,
  processStreamingResponse,
  STREAM_FORMAT_PATTERNS,
} from '../../src/util/fetch';

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

    it('should set multiChunkDelivery=true for multi-chunk responses', async () => {
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

      expect(result.streamingMetrics.multiChunkDelivery).toBe(true);
      expect(result.text).toBe('Chunk 1Chunk 2Chunk 3');
    });

    it('should set multiChunkDelivery=false for single-chunk responses', async () => {
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

      expect(result.streamingMetrics.multiChunkDelivery).toBe(false);
      expect(result.text).toBe('Complete response in one chunk');
      // TTFT should still be measured from request start
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(10);
    });

    it('should pin totalStreamTime to first-byte → last-byte window', async () => {
      // Two chunks 100ms apart. totalStreamTime should be ~100ms, not
      // "time spent in the function" (which includes reader initialization).
      const requestStartTime = Date.now();
      const chunks = [new TextEncoder().encode('first'), new TextEncoder().encode(' second')];

      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < chunks.length) {
            // First read resolves after 30ms, second after an additional 100ms.
            await new Promise((r) => setTimeout(r, i === 0 ? 30 : 100));
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const result = await processStreamingResponse(
        { body: { getReader: () => mockReader } } as unknown as Response,
        requestStartTime,
      );

      // totalStreamTime is from first byte to last byte: ~100ms.
      // NOT 130ms (which would include the 30ms initial wait).
      expect(result.streamingMetrics.totalStreamTime).toBeGreaterThanOrEqual(85);
      expect(result.streamingMetrics.totalStreamTime).toBeLessThan(150);
    });

    it('should trigger TTFT on OpenAI role-prefix SSE frame (documented semantics)', async () => {
      // Pins current behavior: TTFT measures "first non-whitespace wire byte",
      // not "first content token". OpenAI's SSE stream opens with a role frame:
      //   data: {"choices":[{"delta":{"role":"assistant"}}]}
      // which carries no content but is non-whitespace. TTFT fires on it.
      // The delay between this frame and the first content delta is usually
      // sub-millisecond; callers needing strict "first content token" should
      // parse the stream in transformResponse.
      const requestStartTime = Date.now();

      const chunks = [
        new TextEncoder().encode('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'),
        new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
        new TextEncoder().encode('data: [DONE]\n\n'),
      ];

      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < chunks.length) {
            await new Promise((r) => setTimeout(r, 20));
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const result = await processStreamingResponse(
        { body: { getReader: () => mockReader } } as unknown as Response,
        requestStartTime,
      );

      // TTFT fires on the very first SSE frame (~20ms), not on the content delta (~40ms).
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(15);
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThan(40);
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

    it('should leave timeToFirstToken undefined when no non-whitespace chunk arrives', async () => {
      const requestStartTime = Date.now();

      const chunks = [
        new TextEncoder().encode(''),
        new TextEncoder().encode('   '),
        new TextEncoder().encode('\n\n'),
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
        body: { getReader: () => mockReader },
      } as unknown as Response;

      const result = await processStreamingResponse(mockResponse, requestStartTime);

      // No real content ever arrived: downstream ttft assertion should see
      // undefined and report a clear error instead of comparing total
      // latency against the threshold.
      expect(result.streamingMetrics.timeToFirstToken).toBeUndefined();
    });
  });

  describe('Error handling', () => {
    it('should throw error if response body is not readable', async () => {
      const requestStartTime = Date.now();

      const mockResponse = {
        body: null,
        status: 204,
      } as unknown as Response;

      await expect(processStreamingResponse(mockResponse, requestStartTime)).rejects.toThrow(
        'Response has no readable body (status 204)',
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

  describe('tokensPerSecond derivation', () => {
    it('should not be set by processStreamingResponse (raw SSE inflates the number)', async () => {
      const requestStartTime = Date.now();

      // Simulate SSE frames: 4 chunks totalling ~200 chars of wire bytes
      // but only ~20 chars of actual content.
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" friend"}}]}\n\n',
        'data: [DONE]\n\n',
      ].map((s) => new TextEncoder().encode(s));

      let i = 0;
      const mockReader = {
        read: vi.fn(async () => {
          if (i < chunks.length) {
            await new Promise((r) => setTimeout(r, 20));
            return { done: false, value: chunks[i++] };
          }
          return { done: true, value: undefined };
        }),
        releaseLock: vi.fn(),
      };

      const result = await processStreamingResponse(
        { body: { getReader: () => mockReader } } as unknown as Response,
        requestStartTime,
      );

      // The util deliberately leaves tps unpopulated — callers compute it
      // on the parsed completion text, not the raw SSE buffer.
      expect(result.streamingMetrics.tokensPerSecond).toBeUndefined();
      expect(result.streamingMetrics.totalStreamTime).toBeGreaterThan(0);
    });
  });

  describe('estimateStreamingTokensPerSecond', () => {
    it('should compute chars/4 per second over the streamed window', () => {
      // 400 chars / 4 = 100 tokens, over 1000ms => 100 tps
      expect(estimateStreamingTokensPerSecond(400, 1000)).toBe(100);
    });

    it('should return undefined when the stream window is below the floor', () => {
      expect(
        estimateStreamingTokensPerSecond(400, MIN_MEANINGFUL_STREAM_WINDOW_MS - 1),
      ).toBeUndefined();
      expect(estimateStreamingTokensPerSecond(400, 0)).toBeUndefined();
      expect(estimateStreamingTokensPerSecond(400, undefined)).toBeUndefined();
    });

    it('should return undefined for empty completions', () => {
      expect(estimateStreamingTokensPerSecond(0, 500)).toBeUndefined();
      expect(estimateStreamingTokensPerSecond(-1, 500)).toBeUndefined();
    });

    it('should populate at the window floor', () => {
      // At exactly the floor, we still emit a value (the floor is inclusive).
      expect(
        estimateStreamingTokensPerSecond(200, MIN_MEANINGFUL_STREAM_WINDOW_MS),
      ).toBeGreaterThan(0);
    });
  });

  describe('firstTokenDetector option', () => {
    function mockStream(frames: string[], perChunkDelayMs = 20) {
      let i = 0;
      return {
        body: {
          getReader: () => ({
            read: vi.fn(async () => {
              if (i < frames.length) {
                await new Promise((r) => setTimeout(r, perChunkDelayMs));
                return { done: false, value: new TextEncoder().encode(frames[i++]) };
              }
              return { done: true, value: undefined };
            }),
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response;
    }

    it('should use canonical TTFT when detector targets content deltas', async () => {
      // Simulates OpenAI: role frame first, content frame second, separated by ~20ms.
      const frames = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const response = mockStream(frames, 20);
      const requestStartTime = Date.now();

      const contentPattern = /"delta":\s*\{[^}]*"content":"[^"]/;
      const result = await processStreamingResponse(response, requestStartTime, {
        firstTokenDetector: (buf) => contentPattern.test(buf),
      });

      // TTFT fires on the second frame (~40ms), not on the role frame (~20ms).
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(35);
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThan(80);
    });

    it('should fall back to default detector when no opts provided', async () => {
      const frames = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      ];
      const requestStartTime = Date.now();
      const result = await processStreamingResponse(mockStream(frames, 20), requestStartTime);

      // Default fires on the first frame (~20ms).
      expect(result.streamingMetrics.timeToFirstToken).toBeGreaterThanOrEqual(15);
      expect(result.streamingMetrics.timeToFirstToken).toBeLessThan(40);
    });

    it('should leave TTFT undefined when detector never fires', async () => {
      const frames = ['data: {"only":"metadata"}\n\n', 'data: [DONE]\n\n'];
      const requestStartTime = Date.now();

      const result = await processStreamingResponse(mockStream(frames, 10), requestStartTime, {
        firstTokenDetector: (buf) => /"content":/.test(buf),
      });

      expect(result.streamingMetrics.timeToFirstToken).toBeUndefined();
    });

    it('exports firstNonWhitespaceByteDetector for explicit opt-in', () => {
      expect(firstNonWhitespaceByteDetector('')).toBe(false);
      expect(firstNonWhitespaceByteDetector('   \n\t  ')).toBe(false);
      expect(firstNonWhitespaceByteDetector('  data: x')).toBe(true);
    });
  });

  describe('streamFormat presets', () => {
    describe('openai-chat preset', () => {
      const detector = detectorForStreamFormat('openai-chat');

      it('does not fire on the role framing frame', () => {
        const buf = 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('fires on the first content delta', () => {
        const buf =
          'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n';
        expect(detector(buf)).toBe(true);
      });

      it('does not fire on tool-call framing (no content field)', () => {
        const buf =
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"x"}}]}}]}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on empty content ("content":"")', () => {
        const buf = 'data: {"choices":[{"delta":{"content":""}}]}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on null content ("content":null)', () => {
        const buf = 'data: {"choices":[{"delta":{"content":null}}]}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on sibling fields named similarly (content_filter_results)', () => {
        // Seen in Azure OpenAI preambles. Our pattern looks for the exact
        // "content":"X" token, not any key containing "content".
        const buf =
          'data: {"choices":[{"delta":{"role":"assistant","content_filter_results":{"hate":{"filtered":false}}}}]}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('fires when a preceding delta carried tool_calls before content arrived', () => {
        const buf =
          'data: {"choices":[{"delta":{"tool_calls":[]}}]}\n\n' +
          'data: {"choices":[{"delta":{"content":"Answer"}}]}\n\n';
        expect(detector(buf)).toBe(true);
      });

      it('fires on content that includes escape sequences', () => {
        // The first content char after `"content":"` is `\` which is non-quote.
        const buf = 'data: {"choices":[{"delta":{"content":"\\"Hi\\""}}]}\n\n';
        expect(detector(buf)).toBe(true);
      });
    });

    describe('openai-responses preset', () => {
      const detector = detectorForStreamFormat('openai-responses');

      it('does not fire on response.created', () => {
        expect(detector('data: {"type":"response.created","response":{"id":"r_1"}}\n\n')).toBe(
          false,
        );
      });

      it('does not fire on response.in_progress / output_item.added / content_part.added', () => {
        // Responses API sends a burst of metadata events before the first delta.
        // These are what cause the 150-200ms framing gap on this endpoint.
        const preamble =
          'data: {"type":"response.created","response":{"id":"r_1"}}\n\n' +
          'data: {"type":"response.in_progress","response":{"id":"r_1"}}\n\n' +
          'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message"}}\n\n' +
          'data: {"type":"response.content_part.added","item_id":"msg_1","part":{"type":"output_text","text":""}}\n\n';
        expect(detector(preamble)).toBe(false);
      });

      it('fires on the first output_text.delta', () => {
        const buf =
          'data: {"type":"response.created","response":{"id":"r_1"}}\n\n' +
          'data: {"type":"response.output_text.delta","delta":"The"}\n\n';
        expect(detector(buf)).toBe(true);
      });

      it('does not fire on output_text.done (end-of-stream summary)', () => {
        const buf = 'data: {"type":"response.output_text.done","text":"The final text"}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on empty delta ("delta":"")', () => {
        const buf = 'data: {"type":"response.output_text.delta","delta":""}\n\n';
        expect(detector(buf)).toBe(false);
      });
    });

    describe('anthropic-messages preset', () => {
      const detector = detectorForStreamFormat('anthropic-messages');

      it('does not fire on message_start / content_block_start', () => {
        const buf =
          'event: message_start\ndata: {"type":"message_start"}\n\n' +
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('fires on the first text_delta', () => {
        const buf =
          'event: content_block_delta\n' +
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n';
        expect(detector(buf)).toBe(true);
      });

      it('does not fire on input_json_delta (tool-use streaming, not content)', () => {
        const buf =
          'event: content_block_delta\n' +
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"x\\":1"}}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on empty text_delta', () => {
        const buf =
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":""}}\n\n';
        expect(detector(buf)).toBe(false);
      });

      it('does not fire on thinking_delta (extended thinking, not final content)', () => {
        // Claude extended thinking emits thinking_delta before text_delta.
        // Treating thinking as TTFT would inflate the metric with reasoning time
        // and hide the actual first-output-token latency.
        const buf =
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think"}}\n\n';
        expect(detector(buf)).toBe(false);
      });
    });

    it('closes the framing gap on a mocked OpenAI Chat stream', async () => {
      // Same-stream comparison: role frame at ~20ms, content delta at ~40ms.
      // Default detector fires on the role frame; openai-chat preset fires on
      // the content delta. Both measurements come from the *same* mocked
      // stream, so the gap is attributable to the detector, not network noise.
      const frames = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const buildResponse = () => {
        let i = 0;
        return {
          body: {
            getReader: () => ({
              read: vi.fn(async () => {
                if (i < frames.length) {
                  await new Promise((r) => setTimeout(r, 20));
                  return { done: false, value: new TextEncoder().encode(frames[i++]) };
                }
                return { done: true, value: undefined };
              }),
              releaseLock: vi.fn(),
            }),
          },
        } as unknown as Response;
      };

      const t0 = Date.now();
      const defaultResult = await processStreamingResponse(buildResponse(), t0);
      const presetResult = await processStreamingResponse(buildResponse(), t0, {
        firstTokenDetector: detectorForStreamFormat('openai-chat'),
      });

      const defaultTtft = defaultResult.streamingMetrics.timeToFirstToken!;
      const presetTtft = presetResult.streamingMetrics.timeToFirstToken!;

      // Both are measured from the same t0 so their difference reflects the
      // frame-delay built into the mock stream (~20ms per frame). The preset
      // should stamp LATER than the default because it skips the role frame.
      expect(presetTtft).toBeGreaterThan(defaultTtft);

      // Absolute bounds: default ~20ms (first frame), preset ~40ms (second).
      // Two streams + setTimeout jitter — allow generous windows but enforce ordering.
      expect(defaultTtft).toBeLessThan(80);
      expect(presetTtft).toBeGreaterThan(35);
    });

    it('exports STREAM_FORMAT_PATTERNS as a regex map', () => {
      expect(STREAM_FORMAT_PATTERNS['openai-chat']).toBeInstanceOf(RegExp);
      expect(STREAM_FORMAT_PATTERNS['openai-responses']).toBeInstanceOf(RegExp);
      expect(STREAM_FORMAT_PATTERNS['anthropic-messages']).toBeInstanceOf(RegExp);
    });
  });
});
