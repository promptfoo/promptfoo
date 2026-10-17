import { setImmediate } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readResponsesStream } from '../../../src/providers/responses/stream';

vi.mock('node:timers/promises', () => ({ setImmediate: vi.fn(async () => {}) }));

const logger = { debug: vi.fn() };
const completed = {
  id: 'response-1',
  status: 'completed',
  output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'café 日本語' }] },
  ],
  usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
};

function chunkedResponse(text: string, chunkSize: number) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
        offset = Math.min(bytes.length, offset + chunkSize);
      },
    }),
  );
}

describe('Responses stream transport', () => {
  beforeEach(() => {
    vi.mocked(setImmediate).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(
    ['\n', '\r', '\r\n'].flatMap((ending) =>
      [1, 7, 65536].map((chunkSize) => ({ ending, chunkSize })),
    ),
  )('parses line ending $ending in $chunkSize-byte chunks', async ({ ending, chunkSize }) => {
    const text = [
      ': keepalive',
      '',
      'event: response.completed',
      'data: {"type":"response.completed",',
      `data: "response":${JSON.stringify(completed)}}`,
      '',
      'data: [DONE]',
      '',
      '',
    ].join(ending);
    const response = chunkedResponse(text, chunkSize);
    const onResponse = vi.fn();
    await expect(readResponsesStream(response, 'fixture', logger, onResponse)).resolves.toEqual(
      completed,
    );
    expect(onResponse).toHaveBeenCalledExactlyOnceWith(completed);
    expect(response.body?.locked).toBe(false);
  });

  it('processes the final event without a trailing delimiter', async () => {
    const response = chunkedResponse(
      `data: ${JSON.stringify({ type: 'response.completed', response: completed })}`,
      7,
    );
    await expect(readResponsesStream(response, 'fixture', logger)).resolves.toEqual(completed);
  });

  it.each(['{', '[]', 'null'])(
    'rejects unfinished text after malformed event data %s',
    async (data) => {
      const response = chunkedResponse(
        `data: {"type":"response.output_text.delta","delta":"draft"}\n\ndata: ${data}\n\n`,
        7,
      );
      await expect(readResponsesStream(response, 'fixture', logger)).rejects.toThrow(
        'malformed SSE data',
      );
      expect(response.body?.locked).toBe(false);
    },
  );

  it.each(['wrapped', 'top-level'])(
    'preserves a completed %s response after malformed data',
    async (form) => {
      const terminal = form === 'wrapped' ? { response: completed } : completed;
      const response = chunkedResponse(
        'data: {"type":"response.output_text.delta","delta":"draft"}\n\n' +
          'data: not-json\n\n' +
          `data: ${JSON.stringify(terminal)}\n\n`,
        7,
      );
      await expect(readResponsesStream(response, 'fixture', logger)).resolves.toEqual(completed);
      expect(response.body?.locked).toBe(false);
    },
  );

  it.each([false, true])(
    'preserves a terminal failure after malformed data with preserveFailedOutput=%s',
    async (preserveFailedOutput) => {
      const failed = {
        id: 'response-1',
        status: 'failed',
        error: { code: 'rate_limit_exceeded', message: 'Rate limit exceeded' },
      };
      const response = chunkedResponse(
        'data: {"type":"response.output_text.delta","delta":"draft"}\n\n' +
          'data: not-json\n\n' +
          `data: ${JSON.stringify({ type: 'response.failed', response: failed })}\n\n`,
        7,
      );
      await expect(
        readResponsesStream(response, 'fixture', logger, undefined, { preserveFailedOutput }),
      ).resolves.toEqual(failed);
      expect(response.body?.locked).toBe(false);
    },
  );

  it('cancels the body when a provider error ends parsing', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"error","message":"fixture failure"}\n\n'),
          );
        },
        cancel,
      }),
    );
    await expect(readResponsesStream(response, 'fixture', logger)).rejects.toThrow(
      'fixture failure',
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it('cancels a stalled body when its caller aborts', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    const pending = readResponsesStream(response, 'fixture', logger, undefined, {
      signal: controller.signal,
    });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });

  it('preserves a provider error while a response clone is still being read', async () => {
    const { setImmediate: nextTurn } =
      await vi.importActual<typeof import('node:timers/promises')>('node:timers/promises');
    let finishResponse = () => {};
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"error","message":"fixture failure"}\n\n'),
          );
          finishResponse = () => controller.close();
        },
      }),
    );
    const loggingRead = response.clone().text();
    let errorReturned = false;
    const parsing = readResponsesStream(response, 'fixture', logger).catch((error) => {
      errorReturned = true;
      throw error;
    });
    const assertion = expect(parsing).rejects.toThrow('fixture failure');

    try {
      await nextTurn();
      expect(errorReturned).toBe(true);
      expect(response.body?.locked).toBe(false);
    } finally {
      finishResponse();
      await Promise.all([assertion, loggingRead]);
    }
  });

  it('cancels an already-aborted body without consuming an event', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }));
    await expect(
      readResponsesStream(response, 'fixture', logger, undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['reads', 'events'])(
    'yields during repeated %s so cancellation can run',
    async (mode) => {
      const controller = new AbortController();
      const cancel = vi.fn();
      vi.mocked(setImmediate).mockImplementationOnce(async () => {
        controller.abort();
      });
      const payload = mode === 'reads' ? ':' : ': keepalive\n\n'.repeat(512);
      const response = new Response(
        new ReadableStream({
          pull(stream) {
            stream.enqueue(new TextEncoder().encode(payload));
          },
          cancel,
        }),
      );
      await expect(
        readResponsesStream(response, 'fixture', logger, undefined, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(setImmediate).toHaveBeenCalled();
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

  it.each(['terminated', 'unterminated'])('bounds a %s event', async (mode) => {
    const text = ':'.repeat(16 * 1024 * 1024 + 1) + (mode === 'terminated' ? '\n\n' : '');
    await expect(
      readResponsesStream(chunkedResponse(text, 1024 * 1024), 'fixture', logger),
    ).rejects.toThrow('event limit');
  });

  it('bounds total input even when every individual event is small', async () => {
    const cancel = vi.fn();
    const chunk = new TextEncoder().encode(':'.repeat(1024 * 1024 - 2) + '\n\n');
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(chunk);
        },
        cancel,
      }),
    );
    await expect(readResponsesStream(response, 'fixture', logger)).rejects.toThrow(
      'exceeds 64 MiB',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['\n\n', ''])('bounds event count with final delimiter %s', async (ending) => {
    const text = ':\n\n'.repeat(100000) + ': final' + ending;
    await expect(
      readResponsesStream(chunkedResponse(text, 65536), 'fixture', logger),
    ).rejects.toThrow('event limit');
  });

  it('releases the reader when the source fails', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('fixture disconnected'));
        },
      }),
    );
    await expect(readResponsesStream(response, 'fixture', logger)).rejects.toThrow(
      'fixture disconnected',
    );
    expect(response.body?.locked).toBe(false);
  });
});
