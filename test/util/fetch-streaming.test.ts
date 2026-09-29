import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  estimateStreamingTokensPerSecond,
  processStreamingResponse,
} from '../../src/util/fetch/streaming';

const encoder = new TextEncoder();
function stream(chunks: (string | Uint8Array)[], delay = 20, tailDelay = 0) {
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) =>
          setTimeout(resolve, index < chunks.length ? delay : tailDelay),
        );
        if (index === chunks.length) {
          controller.close();
        } else {
          const chunk = chunks[index++];
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
        }
      },
    }),
  );
}
async function collect(
  chunks: (string | Uint8Array)[],
  format?: 'openai-chat' | 'openai-responses' | 'anthropic-messages',
  tailDelay = 0,
) {
  vi.useFakeTimers();
  const start = Date.now();
  const result = processStreamingResponse(stream(chunks, 20, tailDelay), start - 100, {
    streamFormat: format,
  });
  await vi.runAllTimersAsync();
  return result;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('streaming response metrics', () => {
  it('includes request setup in TTFT and excludes idle tail from stream duration', async () => {
    const result = await collect([' ', 'Hello', ' world'], undefined, 500);
    expect(result.text).toBe(' Hello world');
    expect(result.streamingMetrics).toEqual({
      timeToFirstToken: 140,
      totalStreamTime: 40,
      multiChunkDelivery: true,
    });
  });

  it.each([[], [' ', '\n'], ['']])('leaves TTFT undefined without output: %j', async (...args) => {
    const result = await collect(args as string[]);
    expect(result.streamingMetrics.timeToFirstToken).toBeUndefined();
  });

  it('preserves UTF-8 split across chunks and flushes truncated characters', async () => {
    const bytes = encoder.encode('🌍');
    const result = await collect([bytes.slice(0, 2), bytes.slice(2), new Uint8Array([0xc3])]);
    expect(result.text).toBe('🌍�');
    expect(result.streamingMetrics.timeToFirstToken).toBe(140);
  });

  it('requires a readable body', async () => {
    await expect(processStreamingResponse(new Response(null), Date.now())).rejects.toThrow(
      'no readable body',
    );
  });

  it('releases the stream lock after read errors', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('read failed'));
        },
      }),
    );
    await expect(processStreamingResponse(response, Date.now())).rejects.toThrow('read failed');
    expect(response.body?.locked).toBe(false);
  });

  it('rejects an oversized pending event and cancels its body', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: ' + ' '.repeat(64 * 1024)));
        },
        cancel,
      }),
    );
    await expect(
      processStreamingResponse(response, Date.now(), { streamFormat: 'openai-chat' }),
    ).rejects.toThrow('exceeds 64 KiB');
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it.each([
    ['openai-chat', { choices: [{ delta: { content: 'Hello' } }] }],
    ['openai-chat', { choices: [{ delta: { refusal: 'I cannot help.' } }] }],
    ['openai-responses', { type: 'response.output_text.delta', delta: 'Hello' }],
    ['openai-responses', { type: 'response.refusal.delta', delta: 'I cannot help.' }],
    [
      'anthropic-messages',
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
    ],
  ] as const)('detects displayed text for %s: %j', async (format, event) => {
    const result = await collect([': comment\n\n', `data: ${JSON.stringify(event)}\n\n`], format);
    expect(result.streamingMetrics.timeToFirstToken).toBe(140);
  });

  it.each(['\n', '\r', '\r\n'])(
    'accepts SSE delimiter %j split across network chunks',
    async (delimiter) => {
      const text = `data: {"choices":[{"delta":{"role":"assistant"}}]}${delimiter}${delimiter}data: {"choices":[{"delta":{"content":"Hi"}}]}${delimiter}${delimiter}`;
      const result = await collect(Array.from(text), 'openai-chat');
      expect(result.text).toBe(text);
      expect(result.streamingMetrics.timeToFirstToken).toBeDefined();
    },
  );

  it('joins data lines and handles a final event without a blank terminator', async () => {
    const result = await collect(
      ['data: {"choices":\n', 'data: [{"delta":{"content":"Hi"}}]}'],
      'openai-chat',
    );
    expect(result.streamingMetrics.timeToFirstToken).toBe(140);
  });

  it('ignores metadata, empty text, tool calls and malformed events', async () => {
    const events = [
      ': keepalive',
      'data: not json',
      'data: [DONE]',
      'data: {"choices":[{"delta":{"role":"assistant","content":null}}]}',
      'data: {"choices":[{"delta":{"content":"","refusal":""}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[]}}],"content":"metadata"}',
    ];
    const result = await collect(
      events.map((event) => event + '\n\n'),
      'openai-chat',
    );
    expect(result.streamingMetrics.timeToFirstToken).toBeUndefined();
  });

  it('parses each completed event once across chunk boundaries', async () => {
    const parse = vi.spyOn(JSON, 'parse');
    await collect(['data: {"choices":', '[]}\n\n', 'data: {"choices":[]}\n\n'], 'openai-chat');
    expect(parse.mock.calls.filter(([text]) => text === '{"choices":[]}')).toHaveLength(2);
  });
});

describe('streaming throughput estimate', () => {
  it.each([
    [0, 100],
    [200, undefined],
    [200, 0],
    [200, 49],
  ])('omits short or empty streams (%s chars, %sms)', (chars, duration) => {
    expect(estimateStreamingTokensPerSecond(chars!, duration)).toBeUndefined();
  });
  it('estimates using four characters per token from 50ms onward', () => {
    expect(estimateStreamingTokensPerSecond(200, 50)).toBe(1000);
    expect(estimateStreamingTokensPerSecond(200, 1000)).toBe(50);
  });
});
