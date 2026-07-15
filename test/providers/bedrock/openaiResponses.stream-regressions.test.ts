import { describe, expect, it, vi } from 'vitest';
import { ResponsesProcessor } from '../../../src/providers/responses/processor';
import { readResponsesStream } from '../../../src/providers/responses/stream';

function createSseResponse(events: unknown[]): Response {
  return new Response(
    events.map((event: any) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n`).join('\n'),
  );
}

function createProcessor(processCalls = vi.fn()) {
  return new ResponsesProcessor({
    modelName: 'test',
    providerType: 'openai',
    functionCallbackHandler: { processCalls } as any,
    costCalculator: vi.fn(),
  });
}

describe('Responses stream regressions', () => {
  it('cancels an aborted Responses stream delivered in single-byte chunks', async () => {
    const abortController = new AbortController();
    const prefix = new TextEncoder().encode('data: {"type":"ignored","payload":"');
    const byteLimit = 64 * 1024;
    let sent = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent === 0) {
          sent = prefix.length;
          controller.enqueue(prefix);
          return;
        }
        if (sent >= byteLimit) {
          controller.close();
          return;
        }
        sent++;
        controller.enqueue(Uint8Array.of(97));
      },
      cancel() {
        cancelled = true;
      },
    });
    const timer = setTimeout(() => abortController.abort(), 25);

    try {
      await expect(
        readResponsesStream(
          new Response(stream),
          'test',
          { debug: vi.fn() },
          abortController.signal,
        ),
      ).rejects.toThrow(/abort/i);
    } finally {
      clearTimeout(timer);
    }

    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(byteLimit);
  });

  it.each([
    '\n',
    '\r\n',
  ])('parses single-byte-chunk SSE events with %j line endings', async (eol) => {
    const body = new TextEncoder().encode(
      [
        'event: response.output_text.done',
        'data: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"hello"}',
        '',
        'event: response.completed',
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"hello"}]}]}}',
        '',
        '',
      ].join(eol),
    );
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= body.length) {
          controller.close();
          return;
        }
        controller.enqueue(body.subarray(index, ++index));
      },
    });

    const parsed = await readResponsesStream(new Response(stream), 'test', { debug: vi.fn() });

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'hello' })],
      }),
    ]);
  });

  it('does not treat an extra carriage return inside a multiline data event as a separator', async () => {
    const body = new TextEncoder().encode(
      'event: response.output_text.done\n' +
        'data: {"type":"response.output_text.done",\n' +
        '\r\r\n' +
        'data: "output_index":0,"content_index":0,"text":"hello"}\n\n',
    );
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= body.length) {
          controller.close();
          return;
        }
        controller.enqueue(body.subarray(index, ++index));
      },
    });

    const parsed = await readResponsesStream(new Response(stream), 'test', { debug: vi.fn() });

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'hello' })],
      }),
    ]);
  });

  it('removes filtered terminal draft text before returning refusal output', async () => {
    const response = createSseResponse([
      {
        type: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'content_filter', message: 'blocked by safety system' },
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'SECRET OR UNSAFE DRAFT' }],
            },
          ],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(JSON.stringify(parsed.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    expect(processed).toEqual(expect.objectContaining({ isRefusal: true }));
  });

  it('keeps operational safety-service errors as errors', async () => {
    const response = createSseResponse([
      {
        type: 'response.failed',
        response: {
          status: 'failed',
          error: { code: 'server_error', message: 'upstream safety service unavailable' },
          output: [],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });

    expect(parsed.error).toEqual(
      expect.objectContaining({
        code: 'server_error',
        message: 'upstream safety service unavailable',
      }),
    );
    expect(JSON.stringify(parsed.output)).not.toContain('refusal');
  });

  it.each([
    { name: 'with empty content', content: [] },
    {
      name: 'with draft content',
      content: [{ type: 'output_text', text: 'SECRET OR UNSAFE DRAFT' }],
    },
  ])('normalizes an incomplete top-level terminal refusal $name', async ({ content }) => {
    const response = createSseResponse([
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
          output: [{ type: 'message', role: 'assistant', refusal: 'blocked', content }],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(JSON.stringify(parsed.output)).not.toContain('SECRET OR UNSAFE DRAFT');
    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'refusal', refusal: 'blocked' })],
      }),
    ]);
    expect(processed).toEqual(expect.objectContaining({ output: 'blocked', isRefusal: true }));
  });

  it.each([
    { name: 'missing', index: {} },
    { name: 'invalid', index: { output_index: 1_000_000_000 } },
  ])('reconciles finalized function-call events with a $name output index', async ({ index }) => {
    const response = createSseResponse([
      {
        type: 'response.function_call_arguments.done',
        ...index,
        item_id: 'fc_1',
        name: 'delete_file',
        arguments: '{"path":"/tmp/secret"}',
      },
      {
        type: 'response.output_item.done',
        ...index,
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'delete_file',
          arguments: '{"path":"/tmp/secret"}',
        },
      },
      { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
    ]);
    const processCalls = vi.fn().mockResolvedValue('executed');

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        name: 'delete_file',
        arguments: '{"path":"/tmp/secret"}',
      }),
    ]);
    expect(processCalls).toHaveBeenCalledTimes(1);
    expect(processCalls).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'fc_1', call_id: 'call_1' }),
      undefined,
    );
  });

  it('keeps finalized output indices when a terminal snapshot is compacted', async () => {
    const response = createSseResponse([
      { type: 'response.output_text.done', output_index: 0, content_index: 0, text: 'first' },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'lookup',
          arguments: '{}',
        },
      },
      { type: 'response.output_text.done', output_index: 2, content_index: 0, text: 'last' },
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          output: [
            {
              type: 'function_call',
              id: 'fc_1',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '{}',
            },
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'la' }] },
          ],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'first' })],
      }),
      expect.objectContaining({ type: 'function_call', id: 'fc_1', call_id: 'call_1' }),
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'last' })],
      }),
    ]);
  });

  it('matches a reconciled function call against a compacted call-id-only terminal item', async () => {
    const response = createSseResponse([
      { type: 'response.output_text.done', output_index: 0, content_index: 0, text: 'first' },
      {
        type: 'response.function_call_arguments.done',
        output_index: 1,
        item_id: 'fc_1',
        name: 'lookup',
        arguments: '{"q":"final"}',
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'function_call',
          call_id: 'call_1',
          name: 'lookup',
          arguments: '{"q":"final"}',
        },
      },
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          output: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'lookup',
              arguments: '{"q":"draft"}',
            },
          ],
        },
      },
    ]);
    const processCalls = vi.fn().mockResolvedValue('executed');

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'first' })],
      }),
      expect.objectContaining({
        type: 'function_call',
        id: 'fc_1',
        call_id: 'call_1',
        arguments: '{"q":"final"}',
      }),
    ]);
    expect(processCalls).toHaveBeenCalledTimes(1);
  });

  it('accumulates escaped refusal deltas without changing their content', async () => {
    const deltas = ['quoted: "', 'line\n', 'slash\\', '\uD800'];
    const response = createSseResponse(
      deltas.map((delta) => ({
        type: 'response.refusal.delta',
        output_index: 0,
        content_index: 0,
        delta,
      })),
    );

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'refusal', refusal: deltas.join('') })],
      }),
    ]);
  });

  it('preserves citation annotations from a finalized message when the stream is truncated', async () => {
    const annotations = [
      {
        type: 'url_citation',
        url: 'https://example.com',
        title: 'Example',
        start_index: 0,
        end_index: 12,
      },
    ];
    const response = createSseResponse([
      { type: 'response.created', response: { status: 'in_progress', output: [] } },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'See citation', annotations }],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [
          expect.objectContaining({ type: 'output_text', text: 'See citation', annotations }),
        ],
      }),
    ]);
    expect(processed.metadata?.annotations).toEqual(annotations);
    expect(processed.raw?.annotations).toEqual(annotations);
  });
});
