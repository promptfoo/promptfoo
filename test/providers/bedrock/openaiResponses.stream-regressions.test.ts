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
  it('cancels an aborted Responses stream that stalls after headers', async () => {
    const abortController = new AbortController();
    let cancelled = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        cancelled = true;
      },
    });
    const pending = readResponsesStream(
      new Response(stream),
      'test',
      { debug: vi.fn() },
      abortController.signal,
    );

    abortController.abort();
    const settled = await Promise.race([
      pending.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);
    if (settled === 'pending') {
      streamController?.close();
      await pending.catch(() => undefined);
    }

    expect(settled).toBe('rejected');
    expect(cancelled).toBe(true);
  });

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

  it('rejects an aborted Responses stream even when underlying cancellation never settles', async () => {
    const abortController = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });
    const pending = readResponsesStream(
      new Response(stream),
      'test',
      { debug: vi.fn() },
      abortController.signal,
    );

    abortController.abort();
    const settled = await Promise.race([
      pending.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
    ]);

    expect(cancelled).toBe(true);
    expect(settled).toBe('rejected');
  });

  it('fails closed on a bounded flood of empty refusal deltas', async () => {
    const event =
      'event: response.refusal.delta\ndata: {"type":"response.refusal.delta","output_index":0,"content_index":0,"delta":""}\n\n';
    const batch = new TextEncoder().encode(event.repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ >= 1025) {
          controller.close();
          return;
        }
        controller.enqueue(batch);
      },
    });

    await expect(
      readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
    ).rejects.toThrow(/exceeded.*(?:event|delta)/i);
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
    {
      name: 'content-filter-service error',
      error: { code: 'content_filter_error', message: 'The contents are not filtered' },
    },
    {
      name: 'rejected rate limit',
      error: {
        code: 'rate_limit_exceeded',
        message: 'Request was rejected because the organization exceeded its rate limit',
      },
    },
    {
      name: 'disallowed request parameter',
      error: {
        code: 'invalid_request_error',
        message: 'The request contains a disallowed parameter: temperature',
      },
    },
    {
      name: 'blocked upstream restart',
      error: { code: 'server_error', message: 'Request blocked while upstream was restarting' },
    },
  ])('does not classify a $name as a refusal', async ({ error }) => {
    const response = createSseResponse([
      { type: 'response.failed', response: { status: 'failed', error, output: [] } },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.error).toEqual(expect.objectContaining(error));
    expect(JSON.stringify(parsed.output)).not.toContain('refusal');
    expect(processed.isRefusal).not.toBe(true);
    expect(processed.error).toContain(error.code);
  });

  it('removes finalized non-message drafts from content-filtered raw output', async () => {
    const response = createSseResponse([
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          id: 'rs_1',
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'SECRET REASONING DRAFT' }],
        },
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          id: 'ci_1',
          type: 'code_interpreter_call',
          status: 'completed',
          code: 'print("SECRET CODE DRAFT")',
          outputs: [],
        },
      },
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          incomplete_details: { reason: 'content_filter' },
          output: [],
        },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false, {
      suppressReasoningOutput: true,
    });

    expect(JSON.stringify(parsed.output)).not.toContain('SECRET');
    expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    expect(processed).toEqual(expect.objectContaining({ isRefusal: true }));
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

  it('preserves citation annotations finalized by content-part events', async () => {
    const annotations = [
      {
        type: 'url_citation',
        url: 'https://example.test',
        title: 'Example',
        start_index: 0,
        end_index: 4,
      },
    ];
    const response = createSseResponse([
      { type: 'response.created', response: { id: 'r_1', status: 'in_progress', output: [] } },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { id: 'm_1', type: 'message', role: 'assistant', content: [] },
      },
      {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        part: { type: 'output_text', text: '', annotations: [] },
      },
      {
        type: 'response.output_text.delta',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        delta: 'cite',
      },
      {
        type: 'response.output_text.annotation.added',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        annotation_index: 0,
        annotation: annotations[0],
      },
      {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        text: 'cite',
      },
      {
        type: 'response.content_part.done',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        part: { type: 'output_text', text: 'cite', annotations },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [expect.objectContaining({ type: 'output_text', text: 'cite', annotations })],
      }),
    ]);
    expect(processed.metadata?.annotations).toEqual(annotations);
    expect(processed.raw?.annotations).toEqual(annotations);
  });

  it('keeps a cited later content part aligned with preceding finalized text', async () => {
    const annotations = [
      {
        type: 'url_citation',
        url: 'https://example.test',
        title: 'Example',
        start_index: 0,
        end_index: 4,
      },
    ];
    const response = createSseResponse([
      { type: 'response.created', response: { id: 'r_1', status: 'in_progress', output: [] } },
      {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        text: 'intro ',
      },
      {
        type: 'response.output_text.done',
        output_index: 0,
        content_index: 1,
        item_id: 'm_1',
        text: 'cite',
      },
      {
        type: 'response.content_part.done',
        output_index: 0,
        content_index: 1,
        item_id: 'm_1',
        part: { type: 'output_text', text: 'cite', annotations },
      },
    ]);

    const parsed = await readResponsesStream(response, 'test', { debug: vi.fn() });
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [
          expect.objectContaining({ type: 'output_text', text: 'intro ' }),
          expect.objectContaining({ type: 'output_text', text: 'cite', annotations }),
        ],
      }),
    ]);
    expect(processed).toEqual(
      expect.objectContaining({
        output: 'intro cite',
        metadata: expect.objectContaining({ annotations }),
      }),
    );
  });

  it('merges a streamed citation into completed terminal text without restoring a draft', async () => {
    const annotations = [
      {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe citation',
        start_index: 0,
        end_index: 4,
      },
    ];
    const parsed = await readResponsesStream(
      createSseResponse([
        {
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          text: 'SECRET OR UNSAFE DRAFT',
        },
        {
          type: 'response.output_text.annotation.added',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          annotation_index: 0,
          annotation: annotations[0],
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [
              {
                type: 'message',
                id: 'm_1',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'SAFE FINAL TEXT' }],
              },
            ],
          },
        },
      ]),
      'test',
      { debug: vi.fn() },
    );
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        id: 'm_1',
        content: [
          expect.objectContaining({ type: 'output_text', text: 'SAFE FINAL TEXT', annotations }),
        ],
      }),
    ]);
    expect(processed.metadata?.annotations).toEqual(annotations);
    expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
  });

  it.each([
    { name: 'repeated streamed citations', streamed: [0, 0], terminal: [], expected: [0] },
    { name: 'distinct streamed citations', streamed: [0, 1], terminal: [], expected: [0, 1] },
    { name: 'repeated terminal citations', streamed: [0], terminal: [0, 0], expected: [0] },
  ])('deduplicates $name without dropping distinct citations', async ({
    streamed,
    terminal,
    expected,
  }) => {
    const citations = [
      {
        type: 'url_citation',
        url: 'https://example.test/one',
        title: 'One',
        start_index: 0,
        end_index: 3,
      },
      {
        type: 'url_citation',
        url: 'https://example.test/two',
        title: 'Two',
        start_index: 4,
        end_index: 7,
      },
    ];
    const parsed = await readResponsesStream(
      createSseResponse([
        {
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          text: 'SECRET OR UNSAFE DRAFT',
        },
        ...streamed.map((citationIndex, annotationIndex) => ({
          type: 'response.output_text.annotation.added',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          annotation_index: annotationIndex,
          annotation: citations[citationIndex],
        })),
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [
              {
                type: 'message',
                id: 'm_1',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: 'SAFE FINAL TEXT',
                    annotations: terminal.map((citationIndex) => citations[citationIndex]),
                  },
                ],
              },
            ],
          },
        },
      ]),
      'test',
      { debug: vi.fn() },
    );
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);
    const expectedAnnotations = expected.map((citationIndex) => citations[citationIndex]);

    expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual(expectedAnnotations);
    expect(processed.metadata?.annotations).toEqual(expectedAnnotations);
    expect(processed.raw?.annotations).toEqual(expectedAnnotations);
    expect(parsed.output?.[0]?.content?.[0]?.text).toBe('SAFE FINAL TEXT');
    expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
  });

  it('never restores unmatched streamed citation text after a completed terminal snapshot', async () => {
    const annotation = {
      type: 'url_citation',
      url: 'https://example.test/unmatched',
      title: 'Unmatched',
      start_index: 0,
      end_index: 4,
    };
    const parsed = await readResponsesStream(
      createSseResponse([
        {
          type: 'response.output_text.done',
          output_index: 3,
          content_index: 0,
          item_id: 'm_other',
          text: 'SECRET OR UNSAFE DRAFT',
        },
        {
          type: 'response.output_text.annotation.added',
          output_index: 3,
          content_index: 0,
          item_id: 'm_other',
          annotation_index: 0,
          annotation,
        },
        {
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [
              {
                type: 'message',
                id: 'm_safe',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'SAFE FINAL TEXT' }],
              },
            ],
          },
        },
      ]),
      'test',
      { debug: vi.fn() },
    );
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        id: 'm_safe',
        content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FINAL TEXT' })],
      }),
    ]);
    expect(parsed.output?.[0]?.content?.[0]?.annotations).toBeUndefined();
    expect(processed.metadata?.annotations).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
  });

  describe('native stream safety regressions', () => {
    it.each([
      {
        name: 'created top-level function call',
        eventType: 'response.created',
        output: [
          {
            type: 'function_call',
            call_id: 'call_dangerous',
            name: 'dangerous_action',
            arguments: '{"path":"/tmp/secret"}',
          },
        ],
      },
      {
        name: 'in-progress top-level function call',
        eventType: 'response.in_progress',
        output: [
          {
            type: 'function_call',
            call_id: 'call_dangerous',
            name: 'dangerous_action',
            arguments: '{"path":"/tmp/secret"}',
          },
        ],
      },
      {
        name: 'created nested tool use',
        eventType: 'response.created',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                call_id: 'call_dangerous',
                name: 'dangerous_action',
                arguments: '{"path":"/tmp/secret"}',
              },
            ],
          },
        ],
      },
      {
        name: 'in-progress nested tool use',
        eventType: 'response.in_progress',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                call_id: 'call_dangerous',
                name: 'dangerous_action',
                arguments: '{"path":"/tmp/secret"}',
              },
            ],
          },
        ],
      },
    ])('never executes a $name snapshot tool at EOF', async ({ eventType, output }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([{ type: eventType, response: { status: 'in_progress', output } }]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it('preserves empty finalized-argument semantics without executing a status-only tool', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'lookup' },
          },
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            item_id: 'fc_1',
            name: 'lookup',
            arguments: '{}',
          },
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
                  status: 'completed',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor(processCalls).processResponseOutput(
        parsed,
        {},
        false,
      );

      expect(processCalls).not.toHaveBeenCalled();
      expect(parsed.output).toEqual([
        expect.objectContaining({
          type: 'function_call',
          call_id: 'call_1',
          arguments: '{}',
          status: 'completed',
        }),
      ]);
      expect(processed.output).toContain('no_arguments_provided');
    });

    it.each([
      { name: 'code', error: { code: 'guardrail_checks_failed', message: 'BLOCKED DRAFT' } },
      { name: 'type', error: { type: 'guardrail_checks_failed', message: 'BLOCKED DRAFT' } },
    ])('scrubs a guardrail_checks_failed $name terminal draft as a refusal', async ({ error }) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.failed',
            response: {
              status: 'failed',
              error,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET OR UNSAFE DRAFT' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain('BLOCKED DRAFT');
      expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it.each([
      { eventType: 'response.failed', response: { status: 'failed', error: null } },
      {
        eventType: 'response.incomplete',
        response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
      },
      { eventType: 'response.cancelled', response: { status: 'cancelled' } },
    ])('never executes a tool call supplied only by a $eventType terminal snapshot', async ({
      eventType,
      response,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: eventType,
            response: {
              ...response,
              output: [
                {
                  type: 'function_call',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                  call_id: 'call_terminal',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(parsed.output).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'function_call' })]),
      );
      expect(processCalls).not.toHaveBeenCalled();
    });

    it.each([
      { eventType: 'response.failed', status: 'failed' },
      { eventType: 'response.incomplete', status: 'incomplete' },
      { eventType: 'response.cancelled', status: 'cancelled' },
    ])('never borrows executable tool metadata from a $eventType terminal snapshot', async ({
      eventType,
      status,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            item_id: 'safe_item',
            arguments: '{"ok":true}',
          },
          {
            type: eventType,
            response: {
              status,
              output: [
                {
                  type: 'function_call',
                  id: 'evil_item',
                  call_id: 'evil_call',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
    });

    it.each([
      { eventType: 'response.failed', status: 'failed' },
      { eventType: 'response.incomplete', status: 'incomplete' },
      { eventType: 'response.cancelled', status: 'cancelled' },
    ])('ignores a late finalized tool call after a $eventType terminal snapshot', async ({
      eventType,
      status,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: eventType, response: { status, output: [] } },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'late_item',
              call_id: 'late_call',
              name: 'dangerous_action',
              arguments: '{"path":"/tmp/secret"}',
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
    });

    it.each([
      'completed',
      'failed',
      'incomplete',
      'cancelled',
    ])('ignores a late stream error after a %s terminal snapshot', async (status) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: `response.${status}`,
            response: {
              status,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL' }],
                },
              ],
            },
          },
          {
            type: 'error',
            error: { code: 'late_error', message: 'SECRET_LATE_ERROR' },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FINAL' })],
        }),
      ]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET_LATE_ERROR');
    });

    it.each([
      {
        name: 'indexed delta',
        event: {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'LATE UNSAFE',
        },
      },
      {
        name: 'unindexed delta',
        event: { type: 'response.output_text.delta', delta: 'LATE UNSAFE' },
      },
      {
        name: 'indexed done',
        event: {
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          text: 'LATE UNSAFE',
        },
      },
    ])('ignores a late $name after authoritative empty completion', async ({ event }) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.completed', response: { status: 'completed', output: [] } },
          event,
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('LATE UNSAFE');
    });

    it.each([
      {
        name: 'indexed delta with empty output',
        event: {
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          delta: 'SECRET OR UNSAFE DRAFT',
        },
        response: { status: 'completed', output: [] },
      },
      {
        name: 'indexed done with empty output',
        event: {
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          text: 'SECRET OR UNSAFE DRAFT',
        },
        response: { status: 'completed', output: [] },
      },
      {
        name: 'unindexed delta with omitted output',
        event: { type: 'response.output_text.delta', delta: 'SECRET OR UNSAFE DRAFT' },
        response: { status: 'completed' },
      },
    ])('keeps a completed terminal authoritative after a $name', async ({ event, response }) => {
      const parsed = await readResponsesStream(
        createSseResponse([event, { type: 'response.completed', response }]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output ?? []).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('treats a safety reason as authoritative even with an operational content-filter error', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              incomplete_details: { reason: 'content_filter' },
              error: {
                code: 'content_filter_error',
                message: 'content-filter service returned an operational error',
              },
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET OR UNSAFE DRAFT' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('does not echo upstream safety error text into a synthesized refusal', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.failed',
            response: {
              status: 'failed',
              error: {
                message: 'blocked by content filter: SECRET OR UNSAFE DRAFT',
              },
              output: [],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET OR UNSAFE DRAFT');
    });

    it('does not borrow a terminal call identity when finalized arguments omit item_id', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            name: 'lookup',
            arguments: '{"q":"final"}',
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  id: 'terminal_item',
                  call_id: 'terminal_call',
                  name: 'lookup',
                  arguments: '{"q":"draft"}',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(parsed.output).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'function_call' })]),
      );
    });

    it.each([
      {
        name: 'arguments from an incomplete terminal snapshot',
        event: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'safe_item',
            call_id: 'safe_call',
            name: 'lookup',
          },
        },
        terminal: {
          type: 'function_call',
          id: 'safe_item',
          call_id: 'safe_call',
          name: 'lookup',
          arguments: '{"path":"/tmp/secret"}',
        },
      },
      {
        name: 'call_id for finalized function-call arguments',
        event: {
          type: 'response.function_call_arguments.done',
          output_index: 0,
          item_id: 'safe_item',
          name: 'lookup',
          arguments: '{"q":"final"}',
        },
        terminal: {
          type: 'function_call',
          id: 'safe_item',
          call_id: 'evil_call',
          name: 'lookup',
          arguments: '{"q":"draft"}',
        },
      },
      {
        name: 'call_id for a finalized output item',
        event: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'function_call',
            id: 'safe_item',
            name: 'lookup',
            arguments: '{"q":"final"}',
          },
        },
        terminal: {
          type: 'function_call',
          id: 'safe_item',
          call_id: 'evil_call',
          name: 'lookup',
          arguments: '{"q":"draft"}',
        },
      },
    ])('never borrows $name to execute a partial tool call', async ({ event, terminal }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          event,
          {
            type: 'response.incomplete',
            response: { status: 'incomplete', output: [terminal] },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(parsed.output).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'function_call' })]),
      );
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
      expect(JSON.stringify(parsed)).not.toContain('evil_call');
    });

    it('executes a fully finalized tool without borrowing terminal fields', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'safe_item',
              call_id: 'safe_call',
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
                  id: 'safe_item',
                  call_id: 'safe_call',
                  name: 'lookup',
                  arguments: '{"q":"draft"}',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls).toHaveBeenCalledWith(
        expect.objectContaining({ call_id: 'safe_call', arguments: '{"q":"final"}' }),
        undefined,
      );
      expect(JSON.stringify(parsed)).not.toContain('draft');
    });

    it('executes one independently finalized tool when argument item_id is missing', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            name: 'lookup',
            arguments: '{"q":"final"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'finalized_item',
              call_id: 'finalized_call',
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
                  id: 'finalized_item',
                  call_id: 'finalized_call',
                  name: 'lookup',
                  arguments: '{"q":"draft"}',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(parsed.output).toEqual([
        expect.objectContaining({
          type: 'function_call',
          id: 'finalized_item',
          call_id: 'finalized_call',
          name: 'lookup',
          arguments: '{"q":"final"}',
        }),
      ]);
      expect(processCalls).toHaveBeenCalledTimes(1);
    });

    it.each([
      'failed',
      'cancelled',
    ])('preserves independently finalized text over a truncated %s terminal snapshot', async (status) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            text: 'SAFE FINALIZED TEXT',
          },
          {
            type: `response.${status}`,
            response: {
              status,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FINALIZED TEXT' })],
        }),
      ]);
    });

    it.each([
      'failed',
      'cancelled',
    ])('never recovers an unfinalized text delta over a %s terminal snapshot', async (status) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            delta: 'SECRET OR UNSAFE DRAFT',
          },
          {
            type: `response.${status}`,
            response: {
              status,
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE TERMINAL TEXT' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(JSON.stringify(parsed)).not.toContain('SECRET OR UNSAFE DRAFT');
      expect(parsed.output).toEqual([
        expect.objectContaining({
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE TERMINAL TEXT' })],
        }),
      ]);
    });

    it('removes blocked audio and transcripts from content-filtered raw output', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.failed',
            response: {
              status: 'failed',
              error: { code: 'content_filter', message: 'blocked by safety system' },
              incomplete_details: {
                reason: 'content_filter',
                raw_output: 'SECRET_DETAILS',
              },
              usage: { input_tokens: 1, raw_output: 'SECRET_USAGE' },
              output_text: 'SECRET_RESPONSE_TEXT',
              raw_output: 'SECRET_RESPONSE_RAW',
              audio: 'SECRET_RESPONSE_AUDIO',
              transcript: 'SECRET RESPONSE TRANSCRIPT',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  status: { raw_output: 'SECRET_STATUS' },
                  audio: 'SECRET_MESSAGE_AUDIO',
                  transcript: 'SECRET MESSAGE TRANSCRIPT',
                  content: [
                    {
                      type: 'output_audio',
                      audio: 'SECRET_AUDIO_BASE64',
                      transcript: 'SECRET TRANSCRIPT',
                    },
                  ],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(processed.isRefusal).toBe(true);
    });

    it.each([
      {
        name: 'filtered terminal message',
        events: [
          {
            type: 'response.failed',
            response: {
              status: 'failed',
              error: { code: 'content_filter', message: 'blocked by safety system' },
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [
                    {
                      type: 'refusal',
                      refusal: 'I cannot help with that.',
                      raw_output: 'SECRET_REFUSAL_RAW',
                      audio: 'SECRET_REFUSAL_AUDIO',
                      transcript: 'SECRET REFUSAL TRANSCRIPT',
                      output_text: 'SECRET REFUSAL TEXT',
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      {
        name: 'finalized content part',
        events: [
          {
            type: 'response.content_part.done',
            output_index: 0,
            content_index: 0,
            part: {
              type: 'refusal',
              refusal: 'I cannot help with that.',
              raw_output: 'SECRET_REFUSAL_RAW',
              audio: 'SECRET_REFUSAL_AUDIO',
              transcript: 'SECRET REFUSAL TRANSCRIPT',
              output_text: 'SECRET REFUSAL TEXT',
            },
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ],
      },
      {
        name: 'finalized output item',
        events: [
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'refusal',
                  refusal: 'I cannot help with that.',
                  raw_output: 'SECRET_REFUSAL_RAW',
                  audio: 'SECRET_REFUSAL_AUDIO',
                  transcript: 'SECRET REFUSAL TRANSCRIPT',
                  output_text: 'SECRET REFUSAL TEXT',
                },
              ],
            },
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ],
      },
    ])('scrubs payload fields from a $name refusal part', async ({ events }) => {
      const parsed = await readResponsesStream(createSseResponse(events), 'test', {
        debug: vi.fn(),
      });
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    });

    it('keeps a finalized refusal authoritative over an incomplete terminal error', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.refusal.done',
            output_index: 0,
            content_index: 0,
            refusal: 'I cannot help with that.',
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              error: { code: 'transient', message: 'SECRET_ERROR_MESSAGE' },
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET ERROR DRAFT' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(processed.output).toBe('I cannot help with that.');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    });

    it.each([
      {
        name: 'done/incomplete',
        terminalType: 'response.incomplete',
        status: 'incomplete',
        event: {
          type: 'response.refusal.done',
          output_index: 0,
          content_index: 0,
          refusal: 'I cannot help with that.',
        },
      },
      {
        name: 'delta/incomplete',
        terminalType: 'response.incomplete',
        status: 'incomplete',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          delta: 'I cannot help with that.',
        },
      },
      {
        name: 'done/in-progress',
        terminalType: 'response.in_progress',
        status: 'in_progress',
        event: {
          type: 'response.refusal.done',
          output_index: 0,
          content_index: 0,
          refusal: 'I cannot help with that.',
        },
      },
      {
        name: 'delta/in-progress',
        terminalType: 'response.in_progress',
        status: 'in_progress',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          delta: 'I cannot help with that.',
        },
      },
      {
        name: 'done/completed',
        terminalType: 'response.completed',
        status: 'completed',
        event: {
          type: 'response.refusal.done',
          output_index: 0,
          content_index: 0,
          refusal: 'I cannot help with that.',
        },
      },
      {
        name: 'delta/completed',
        terminalType: 'response.completed',
        status: 'completed',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          delta: 'I cannot help with that.',
        },
      },
    ])('keeps a finalized refusal $name authoritative over a draft', async ({
      event,
      terminalType,
      status,
    }) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          event,
          {
            type: terminalType,
            response: {
              status,
              output_text: 'SECRET_RESPONSE_TEXT',
              raw_output: 'SECRET_RESPONSE_RAW',
              audio: 'SECRET_RESPONSE_AUDIO',
              transcript: 'SECRET RESPONSE TRANSCRIPT',
              incomplete_details: {
                reason: 'max_output_tokens',
                raw_output: 'SECRET_DETAILS',
              },
              usage: { input_tokens: 1, raw_output: 'SECRET_USAGE' },
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  status: { raw_output: 'SECRET_STATUS' },
                  content: [
                    { type: 'output_text', text: 'SECRET OR UNSAFE DRAFT' },
                    {
                      type: 'output_audio',
                      audio: 'SECRET_AUDIO',
                      transcript: 'SECRET_TRANSCRIPT',
                    },
                  ],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(processed.isRefusal).toBe(true);
    });

    it('keeps distinct malformed output/content index pairs separate', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: '0:0',
            content_index: '1',
            text: 'FIRST',
          },
          {
            type: 'response.output_text.done',
            output_index: '0',
            content_index: '0:1',
            text: 'SECOND',
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([
        expect.objectContaining({ content: [expect.objectContaining({ text: 'FIRST' })] }),
        expect.objectContaining({ content: [expect.objectContaining({ text: 'SECOND' })] }),
      ]);
    });

    it('keeps distinct object-valued malformed indices separate', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: { item: 'first' },
            content_index: 0,
            text: 'FIRST',
          },
          {
            type: 'response.output_text.done',
            output_index: { item: 'second' },
            content_index: 0,
            text: 'SECOND',
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([
        expect.objectContaining({ content: [expect.objectContaining({ text: 'FIRST' })] }),
        expect.objectContaining({ content: [expect.objectContaining({ text: 'SECOND' })] }),
      ]);
    });

    it('preserves an annotation-only citation when reconstructing incomplete output text', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/native-citation',
        title: 'Native citation',
        start_index: 0,
        end_index: 5,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.created',
            response: { id: 'resp_anno', status: 'in_progress', output: [] },
          },
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: {
              id: 'msg_1',
              type: 'message',
              role: 'assistant',
              status: 'in_progress',
              content: [],
            },
          },
          {
            type: 'response.content_part.added',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_1',
            part: { type: 'output_text', text: '', annotations: [] },
          },
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_1',
            delta: 'Hello',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_1',
            annotation_index: 0,
            annotation,
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output).toEqual([
        expect.objectContaining({
          content: [
            expect.objectContaining({
              type: 'output_text',
              text: 'Hello',
              annotations: [annotation],
            }),
          ],
        }),
      ]);
      expect(processed.raw?.annotations).toEqual([annotation]);
    });

    it('does not duplicate a compacted completed message with the same item/content identity', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 1,
            content_index: 0,
            item_id: 'msg_1',
            text: 'Hello',
          },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  id: 'msg_1',
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'Hello' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toHaveLength(1);
      expect(parsed.output[0]).toEqual(
        expect.objectContaining({
          id: 'msg_1',
          content: [expect.objectContaining({ type: 'output_text', text: 'Hello' })],
        }),
      );
    });
  });
});
