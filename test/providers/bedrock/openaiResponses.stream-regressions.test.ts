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
    ).rejects.toThrow(/exceeded.*(?:event|delta|stream input)/i);
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
    {
      name: 'malformed top-level refusal',
      output: [
        {
          type: 'refusal',
          refusal: {
            unsafe: 'SECRET OR UNSAFE DRAFT',
            nested: { credential: 'leaked' },
          },
        },
      ],
      expected: '',
    },
    {
      name: 'malformed nested refusal',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'refusal',
              refusal: {
                unsafe: 'SECRET OR UNSAFE DRAFT',
                nested: { credential: 'leaked' },
              },
            },
          ],
        },
      ],
      expected: '',
    },
    {
      name: 'safe top-level refusal string',
      output: [{ type: 'refusal', refusal: 'I cannot help with that.' }],
      expected: 'I cannot help with that.',
    },
  ])('fails closed on a $name while preserving usage', async ({ output, expected }) => {
    const parsed = await readResponsesStream(
      createSseResponse([
        {
          type: 'response.incomplete',
          response: {
            status: 'incomplete',
            incomplete_details: { reason: 'content_filter' },
            usage: {
              input_tokens: 3,
              output_tokens: 2,
              total_tokens: 5,
              raw_output: 'SECRET_USAGE',
            },
            output,
          },
        },
      ]),
      'test',
      { debug: vi.fn() },
    );
    const processed = await createProcessor().processResponseOutput(parsed, {}, false);

    expect(parsed.output).toEqual([
      expect.objectContaining({
        type: 'message',
        content: [{ type: 'refusal', refusal: expected }],
      }),
    ]);
    expect(parsed.usage).toEqual({ input_tokens: 3, output_tokens: 2, total_tokens: 5 });
    expect(processed).toEqual(
      expect.objectContaining({
        output: expected,
        isRefusal: true,
        tokenUsage: { prompt: 3, completion: 2, total: 5, numRequests: 1 },
      }),
    );
    expect(JSON.stringify(parsed)).not.toContain('SECRET');
    expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    expect(JSON.stringify(parsed)).not.toContain('leaked');
    expect(JSON.stringify(processed.raw)).not.toContain('leaked');
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
      {
        type: 'response.incomplete',
        response: {
          status: 'incomplete',
          output: [
            {
              type: 'function_call',
              call_id: 'call_1',
              name: 'delete_file',
              arguments: '{"path":',
              status: 'in_progress',
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

  it('drops a streamed citation when completed terminal text replaces its draft', async () => {
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
        content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FINAL TEXT' })],
      }),
    ]);
    expect(parsed.output?.[0]?.content?.[0]?.annotations ?? []).toEqual([]);
    expect(processed.metadata?.annotations ?? []).toEqual([]);
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
          text: 'SAFE FINAL TEXT',
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

    it('never finalizes a second terminal tool that duplicates a finalized call identity', async () => {
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
                {
                  type: 'function_call',
                  id: 'safe_item',
                  call_id: 'safe_call',
                  name: 'delete_file',
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

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls).toHaveBeenCalledWith(
        expect.objectContaining({
          call_id: 'safe_call',
          name: 'lookup',
          arguments: '{"q":"final"}',
        }),
        undefined,
      );
      expect(JSON.stringify(parsed)).not.toContain('delete_file');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it.each([
      { name: 'compacted', firstIndex: 2, secondIndex: 3 },
      { name: 'sparse', firstIndex: 100, secondIndex: 101 },
    ])('never executes a displaced duplicate tool from $name finalized indices', async ({
      firstIndex,
      secondIndex,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: firstIndex,
            item: {
              type: 'function_call',
              id: 'safe_a',
              call_id: 'call_a',
              name: 'lookup_a',
              arguments: '{"q":"final-a"}',
            },
          },
          {
            type: 'response.output_item.done',
            output_index: secondIndex,
            item: {
              type: 'function_call',
              id: 'safe_b',
              call_id: 'call_b',
              name: 'lookup_b',
              arguments: '{"q":"final-b"}',
            },
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  id: 'safe_a',
                  call_id: 'call_a',
                  name: 'lookup_a',
                  arguments: '{"q":"draft-a"}',
                },
                {
                  type: 'function_call',
                  id: 'safe_a',
                  call_id: 'call_a',
                  name: 'delete_file',
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

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          call_id: 'call_a',
          name: 'lookup_a',
          arguments: '{"q":"final-a"}',
        }),
        undefined,
      );
      expect(JSON.stringify(parsed)).not.toContain('delete_file');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
      expect(JSON.stringify(parsed)).not.toContain('draft-a');
      expect(JSON.stringify(parsed)).not.toContain('lookup_b');
    });

    it.each([
      { name: 'compacted', firstIndex: 2, secondIndex: 3 },
      { name: 'sparse', firstIndex: 100, secondIndex: 101 },
    ])('executes two independently finalized tools from $name indices', async ({
      firstIndex,
      secondIndex,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: firstIndex,
            item: {
              type: 'function_call',
              id: 'safe_a',
              call_id: 'call_a',
              name: 'lookup_a',
              arguments: '{"q":"final-a"}',
            },
          },
          {
            type: 'response.output_item.done',
            output_index: secondIndex,
            item: {
              type: 'function_call',
              id: 'safe_b',
              call_id: 'call_b',
              name: 'lookup_b',
              arguments: '{"q":"final-b"}',
            },
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  id: 'safe_a',
                  call_id: 'call_a',
                  name: 'lookup_a',
                  arguments: '{"q":"draft-a"}',
                },
                {
                  type: 'function_call',
                  id: 'safe_b',
                  call_id: 'call_b',
                  name: 'lookup_b',
                  arguments: '{"q":"draft-b"}',
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).toHaveBeenCalledTimes(2);
      expect(processCalls).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          call_id: 'call_a',
          name: 'lookup_a',
          arguments: '{"q":"final-a"}',
        }),
        undefined,
      );
      expect(processCalls).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          call_id: 'call_b',
          name: 'lookup_b',
          arguments: '{"q":"final-b"}',
        }),
        undefined,
      );
      expect(JSON.stringify(parsed)).not.toContain('draft-a');
      expect(JSON.stringify(parsed)).not.toContain('draft-b');
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

  describe('native stream fidelity and bound regressions', () => {
    it.each([
      {
        name: 'replacement message',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Action was not approved.' }],
          },
        ],
      },
      { name: 'replacement reasoning item', output: [{ type: 'reasoning', summary: [] }] },
      {
        name: 'different in-progress tool',
        output: [
          {
            type: 'function_call',
            id: 'other_item',
            call_id: 'other_call',
            name: 'lookup',
            arguments: '{"q":',
            status: 'in_progress',
          },
        ],
      },
      { name: 'discarded output', output: [] },
    ])('never resurrects a finalized tool after an incomplete terminal $name', async ({
      output,
    }) => {
      const processCalls = vi.fn().mockResolvedValue('CALLED');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'delete_item',
              call_id: 'delete_call',
              name: 'delete_file',
              arguments: '{"path":"/tmp/secret"}',
              status: 'completed',
            },
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output } },
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
      expect(JSON.stringify(parsed)).not.toContain('delete_file');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
      expect(JSON.stringify(processed)).not.toContain('CALLED');
    });

    it('executes a finalized tool explicitly retained by an incomplete terminal identity', async () => {
      const processCalls = vi.fn().mockResolvedValue('CALLED');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'lookup_item',
              call_id: 'lookup_call',
              name: 'lookup',
              arguments: '{"q":"final"}',
              status: 'completed',
            },
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  id: 'lookup_item',
                  call_id: 'lookup_call',
                  name: 'lookup',
                  arguments: '{"q":',
                  status: 'in_progress',
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

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls).toHaveBeenCalledWith(
        expect.objectContaining({ call_id: 'lookup_call', arguments: '{"q":"final"}' }),
        undefined,
      );
      expect(processed.output).toBe('CALLED');
    });

    it('stays abort-responsive while processing a single legal SSE body chunk', async () => {
      const event =
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"x"}\n\n';
      const body = new TextEncoder().encode(event.repeat(300_000));
      const abortController = new AbortController();
      let cancelled = false;
      let sent = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(body);
          }
        },
        cancel() {
          cancelled = true;
        },
      });
      const started = performance.now();
      let abortDelay = Number.POSITIVE_INFINITY;
      const timer = setTimeout(() => {
        abortDelay = performance.now() - started;
        abortController.abort();
      }, 10);

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
      expect(abortDelay).toBeLessThan(250);
    });

    it.each([
      {
        name: 'finalized output item',
        event: (content: unknown[]) => ({
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'message', id: 'm_parts', role: 'assistant', content },
        }),
      },
      {
        name: 'completed terminal snapshot',
        event: (content: unknown[]) => ({
          type: 'response.completed',
          response: {
            status: 'completed',
            output: [{ type: 'message', id: 'm_parts', role: 'assistant', content }],
          },
        }),
      },
    ])('bounds an oversized $name content-part array before fan-out', async ({ event }) => {
      const content = Array.from({ length: 650_000 }, () => ({ type: 'output_text' }));

      await expect(
        readResponsesStream(createSseResponse([event(content)]), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*content parts/i);
    });

    it('preserves a finalized audio-only message when a stream ends at EOF', async () => {
      const item = {
        type: 'message',
        id: 'm_audio',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_audio', audio: 'QUJD', transcript: 'hello' }],
      };

      const parsed = await readResponsesStream(
        createSseResponse([{ type: 'response.output_item.done', output_index: 0, item }]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([item]);
    });

    it.each([
      'tool_use',
      'function_call',
    ])('preserves finalized audio-only content without reviving a draft or nested %s', async (nestedType) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const audio = { type: 'output_audio', audio: 'QUJD', transcript: 'hello' };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'm_audio',
            delta: 'SECRET DRAFT',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm_audio',
              role: 'assistant',
              status: 'completed',
              content: [
                audio,
                { type: nestedType, name: 'dangerous_action', arguments: '{}', call_id: 'c_1' },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(parsed.output).toEqual([
        expect.objectContaining({ type: 'message', id: 'm_audio', content: [audio] }),
      ]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET DRAFT');
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('compacts malformed terminal slots while preserving indexed non-text output', async () => {
      const item = {
        type: 'message',
        id: 'm_audio',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_audio', audio: 'QUJD', transcript: 'hello' }],
      };

      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 1, item },
          { type: 'response.completed', response: { status: 'completed', output: [null, item] } },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output).toEqual([item]);
    });

    it('bounds malformed completed terminal slots before reconciling finalized items', async () => {
      const finalized = Array.from({ length: 1_023 }, (_, output_index) => ({
        type: 'response.output_item.done',
        output_index,
        item: { type: 'reasoning', id: `reason_${output_index}`, summary: [] },
      }));

      await expect(
        readResponsesStream(
          createSseResponse([
            ...finalized,
            {
              type: 'response.completed',
              response: { status: 'completed', output: Array(400_000).fill(null) },
            },
          ]),
          'test',
          { debug: vi.fn() },
        ),
      ).rejects.toThrow(/streaming response exceeded.*output/i);
    });

    it('accepts 128,000 tiny output-text deltas without charging bounded SSE envelope overhead', async () => {
      const encoder = new TextEncoder();
      const delta =
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"item_id":"m_1","delta":"x"}\n\n';
      const batch = encoder.encode(delta.repeat(1024));
      let batches = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (batches++ < 125) {
            controller.enqueue(batch);
            return;
          }
          const text = 'x'.repeat(128_000);
          controller.enqueue(
            encoder.encode(
              `event: response.output_text.done\ndata: ${JSON.stringify({ type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: 'm_1', text })}\n\n` +
                `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', id: 'm_1', role: 'assistant', content: [{ type: 'output_text', text }] }] } })}\n\n`,
            ),
          );
          controller.close();
        },
      });

      const parsed = await readResponsesStream(new Response(stream), 'test', { debug: vi.fn() });

      expect(parsed.output?.[0]?.content?.[0]?.text).toHaveLength(128_000);
    });

    it('executes a terminal-completed function call with empty arguments and omitted item status', async () => {
      const processCalls = vi.fn().mockResolvedValue('NOARG TOOL RESULT');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'function_call',
                  name: 'noarg_tool',
                  arguments: '',
                  call_id: 'call_1',
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

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          type: 'function_call',
          name: 'noarg_tool',
          arguments: '',
          call_id: 'call_1',
        }),
      );
      expect(processed.output).toBe('NOARG TOOL RESULT');
    });

    it('does not concatenate refusal deltas from different message identities at EOF', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.refusal.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_discarded',
            delta: 'SECRET DRAFT ',
          },
          {
            type: 'response.refusal.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_final',
            delta: 'I cannot comply.',
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('I cannot comply.');
      expect(JSON.stringify(parsed)).not.toContain('SECRET DRAFT');
    });

    it('accepts three permitted six-mebibyte partial-image stream events', async () => {
      const partialImage = 'A'.repeat(6 * 1024 * 1024);
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.image_generation_call.partial_image',
            output_index: 0,
            item_id: 'img_1',
            partial_image_b64: partialImage,
          },
          {
            type: 'response.image_generation_call.partial_image',
            output_index: 0,
            item_id: 'img_1',
            partial_image_b64: partialImage,
          },
          {
            type: 'response.image_generation_call.partial_image',
            output_index: 0,
            item_id: 'img_1',
            partial_image_b64: partialImage,
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
                  content: [{ type: 'output_text', text: 'IMAGE READY' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output?.[0]?.content?.[0]?.text).toBe('IMAGE READY');
    });

    it.each([
      {
        name: 'image-generation result',
        item: (payload: string) => ({
          type: 'image_generation_call',
          id: 'img_1',
          status: 'completed',
          result: payload,
        }),
        field: 'result',
      },
      {
        name: 'code-interpreter code',
        item: (payload: string) => ({
          type: 'code_interpreter_call',
          id: 'ci_1',
          status: 'completed',
          code: payload,
          outputs: [],
        }),
        field: 'code',
      },
    ])('accepts a finalized nine-mebibyte $name duplicated by the terminal snapshot', async ({
      item,
      field,
    }) => {
      const payload = 'x'.repeat(9 * 1024 * 1024);
      const finalized = item(payload);
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item: finalized },
          {
            type: 'response.completed',
            response: { status: 'completed', output: [finalized] },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output?.[0]?.[field]).toHaveLength(9 * 1024 * 1024);
    });

    it.each([
      {
        name: 'content-part refusal finalizer',
        event: {
          type: 'response.content_part.done',
          output_index: 0,
          content_index: 0,
          part: { type: 'refusal', refusal: '' },
        },
      },
      {
        name: 'output-item refusal finalizer',
        event: {
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            id: 'm_1',
            role: 'assistant',
            content: [{ type: 'refusal', refusal: '' }],
          },
        },
      },
    ])('does not let an empty $name replace a completed answer', async ({ event }) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          event,
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  id: 'm_1',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('SAFE FINAL');
      expect(processed.isRefusal).not.toBe(true);
    });

    it.each([
      {
        name: 'content-part refusal finalizer',
        events: [
          {
            type: 'response.content_part.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm',
            part: {
              type: 'refusal',
              refusal: { unsafe: 'SECRET REFUSAL', nested: { credential: 'leaked' } },
            },
          },
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm',
            text: 'SECRET DRAFT',
          },
        ],
      },
      {
        name: 'output-item refusal finalizer',
        events: [
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'SECRET DRAFT' },
                {
                  type: 'refusal',
                  refusal: { unsafe: 'SECRET REFUSAL', nested: { credential: 'leaked' } },
                },
              ],
            },
          },
        ],
      },
    ])('fails closed on a malformed $name at EOF without leaking draft text', async ({
      events,
    }) => {
      const parsed = await readResponsesStream(createSseResponse(events), 'test', {
        debug: vi.fn(),
      });
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(processed.output).toBe('');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('leaked');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('leaked');
    });

    it.each([
      {
        name: 'object',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          item_id: 'm',
          delta: { unsafe: 'SECRET REFUSAL', nested: { credential: 'leaked' } },
        },
      },
      {
        name: 'null',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          item_id: 'm',
          delta: null,
        },
      },
      {
        name: 'missing',
        event: {
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          item_id: 'm',
        },
      },
    ])('fails closed on a malformed $name refusal delta at EOF without leaking draft text', async ({
      event,
    }) => {
      const parsed = await readResponsesStream(
        createSseResponse([
          event,
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm',
            text: 'SECRET DRAFT',
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).toBe(true);
      expect(processed.output).toBe('');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('leaked');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('leaked');
    });

    it.each([
      { name: 'truncated function_call', nestedType: 'function_call', terminalType: undefined },
      { name: 'truncated tool_use', nestedType: 'tool_use', terminalType: undefined },
      {
        name: 'incomplete function_call',
        nestedType: 'function_call',
        terminalType: 'response.incomplete',
      },
      { name: 'incomplete tool_use', nestedType: 'tool_use', terminalType: 'response.incomplete' },
      {
        name: 'in-progress function_call',
        nestedType: 'function_call',
        terminalType: 'response.in_progress',
      },
      {
        name: 'in-progress tool_use',
        nestedType: 'tool_use',
        terminalType: 'response.in_progress',
      },
      {
        name: 'completed function_call',
        nestedType: 'function_call',
        terminalType: 'response.completed',
      },
      { name: 'completed tool_use', nestedType: 'tool_use', terminalType: 'response.completed' },
    ])('never executes nested content from a $name finalized message', async ({
      nestedType,
      terminalType,
    }) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const item = {
        type: 'message',
        id: 'm_safe',
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [annotation] },
          {
            type: nestedType,
            call_id: 'call_1',
            name: 'delete_file',
            arguments: '{"path":"/tmp/secret"}',
          },
        ],
      };
      const terminal = terminalType
        ? {
            type: terminalType,
            response: {
              ...(terminalType === 'response.incomplete'
                ? { status: 'incomplete' }
                : terminalType === 'response.in_progress'
                  ? { status: 'in_progress' }
                  : { status: 'completed' }),
              output: [item],
            },
          }
        : undefined;
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item },
          ...(terminal ? [terminal] : []),
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
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(JSON.stringify(parsed)).not.toContain('delete_file');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it.each([
      { name: 'output_text.done', finalizer: 'text' },
      { name: 'output_item.done', finalizer: 'item' },
    ])('does not attach a stale streamed citation from $name to different completed text', async ({
      finalizer,
    }) => {
      const stale = {
        type: 'url_citation',
        url: 'https://wrong.example/SECRET',
        title: 'SECRET SOURCE',
        start_index: 0,
        end_index: 6,
      };
      const finalized =
        finalizer === 'text'
          ? [
              {
                type: 'response.output_text.done',
                output_index: 0,
                content_index: 0,
                item_id: 'm_safe',
                text: 'SECRET STREAM TEXT',
              },
              {
                type: 'response.output_text.annotation.added',
                output_index: 0,
                content_index: 0,
                item_id: 'm_safe',
                annotation_index: 0,
                annotation: stale,
              },
            ]
          : [
              {
                type: 'response.output_item.done',
                output_index: 0,
                item: {
                  type: 'message',
                  id: 'm_safe',
                  role: 'assistant',
                  content: [
                    {
                      type: 'output_text',
                      text: 'SECRET STREAM TEXT',
                      annotations: [stale],
                    },
                  ],
                },
              },
            ];
      const parsed = await readResponsesStream(
        createSseResponse([
          ...finalized,
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  id: 'm_safe',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(parsed.output?.[0]?.content?.[0]?.annotations ?? []).toEqual([]);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.metadata)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
    });

    it('does not attach a citation finalized with empty text to different completed text', async () => {
      const stale = {
        type: 'url_citation',
        url: 'https://wrong.example/SECRET',
        title: 'SECRET SOURCE',
        start_index: 0,
        end_index: 0,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            text: '',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation: stale,
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
                  content: [{ type: 'output_text', text: 'DIFFERENT FINAL TEXT', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('DIFFERENT FINAL TEXT');
      expect(parsed.output?.[0]?.content?.[0]?.annotations ?? []).toEqual([]);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.metadata)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
    });

    it('does not let an ignored late delta change a finalized citation identity', async () => {
      const stale = {
        type: 'url_citation',
        url: 'https://wrong.example/SECRET',
        title: 'SECRET SOURCE',
        start_index: 0,
        end_index: 6,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SECRET STREAM TEXT',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation: stale,
          },
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'm_other',
            delta: 'IGNORED LATE DELTA',
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
                  content: [{ type: 'output_text', text: 'DIFFERENT FINAL TEXT', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('DIFFERENT FINAL TEXT');
      expect(parsed.output?.[0]?.content?.[0]?.annotations ?? []).toEqual([]);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.metadata)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('IGNORED LATE DELTA');
    });

    it.each([
      { name: 'omitted', terminalContent: { type: 'output_text', annotations: [] } },
      { name: 'null', terminalContent: { type: 'output_text', text: null, annotations: [] } },
      { name: 'number', terminalContent: { type: 'output_text', text: 42, annotations: [] } },
      {
        name: 'object',
        terminalContent: { type: 'output_text', text: { value: 'SAFE' }, annotations: [] },
      },
    ])('does not attach a stale streamed citation when completed text is $name', async ({
      terminalContent,
    }) => {
      const stale = {
        type: 'url_citation',
        url: 'https://wrong.example/SECRET',
        title: 'SECRET SOURCE',
        start_index: 0,
        end_index: 6,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SECRET STREAM TEXT',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation: stale,
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
                  content: [terminalContent],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]?.annotations ?? []).toEqual([]);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.metadata)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
    });

    it.each([
      { name: 'equal non-empty', text: 'SAFE FINAL TEXT' },
      { name: 'equal empty', text: '' },
    ])('preserves a streamed citation when completed text is $name', async ({ text }) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: Math.min(4, text.length),
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            text,
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
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
                  content: [{ type: 'output_text', text, annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual([annotation]);
      expect(processed.metadata?.annotations).toEqual([annotation]);
    });

    it('preserves a citation-only stream annotation on compatible completed output', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
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
                  content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual([annotation]);
      expect(processed.metadata?.annotations).toEqual([annotation]);
    });

    it('does not retype a finalized non-text content slot when a truncated stream annotates it', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://wrong.example',
        title: 'Wrong',
        start_index: 0,
        end_index: 6,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm_audio',
              role: 'assistant',
              content: [
                {
                  type: 'output_audio',
                  text: 'SHOULD_NOT_BE_OUTPUT',
                  audio: 'opaque',
                },
                { type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] },
              ],
            },
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_audio',
            annotation_index: 0,
            annotation,
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]).toEqual({
        type: 'output_audio',
        text: 'SHOULD_NOT_BE_OUTPUT',
        audio: 'opaque',
      });
      expect(parsed.output?.[0]?.content?.[1]).toEqual({
        type: 'output_text',
        text: 'SAFE FINAL TEXT',
        annotations: [],
      });
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(JSON.stringify(processed.output)).not.toContain('SHOULD_NOT_BE_OUTPUT');
      expect(JSON.stringify(processed.metadata)).not.toContain('wrong.example');
    });

    it('preserves a streamed citation on the real text slot of a truncated mixed-content message', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm_audio',
              role: 'assistant',
              content: [
                {
                  type: 'output_audio',
                  text: 'SHOULD_NOT_BE_OUTPUT',
                  audio: 'opaque',
                },
                { type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] },
              ],
            },
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 1,
            item_id: 'm_audio',
            annotation_index: 0,
            annotation,
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]).toEqual({
        type: 'output_audio',
        text: 'SHOULD_NOT_BE_OUTPUT',
        audio: 'opaque',
      });
      expect(parsed.output?.[0]?.content?.[1]).toEqual({
        type: 'output_text',
        text: 'SAFE FINAL TEXT',
        annotations: [annotation],
      });
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations).toEqual([annotation]);
    });

    it.each([
      'response.incomplete',
      'response.in_progress',
      'response.failed',
      'response.cancelled',
      'response.completed',
    ])('never replaces a different terminal message identity after %s', async (terminalType) => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_secret',
            text: 'SECRET FINALIZED TEXT',
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [
                {
                  type: 'message',
                  id: 'm_safe',
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
      const processed = await createProcessor(processCalls).processResponseOutput(
        parsed,
        {},
        false,
      );

      expect(parsed.output).toEqual([
        expect.objectContaining({
          type: 'message',
          id: 'm_safe',
          content: [{ type: 'output_text', text: 'SAFE TERMINAL TEXT' }],
        }),
      ]);
      expect(processed.output).toBe('SAFE TERMINAL TEXT');
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('SECRET FINALIZED TEXT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET FINALIZED TEXT');
    });

    it.each([
      {
        name: 'EOF with a different output index',
        terminalType: undefined,
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'incomplete with a different output index',
        terminalType: 'response.incomplete',
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'in-progress with a different output index',
        terminalType: 'response.in_progress',
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'failed with a different output index',
        terminalType: 'response.failed',
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'cancelled with a different output index',
        terminalType: 'response.cancelled',
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'completed with a different output index',
        terminalType: 'response.completed',
        annotationOutputIndex: 1,
        annotationItemId: 'm_1',
      },
      {
        name: 'EOF with a different item ID',
        terminalType: undefined,
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
      {
        name: 'incomplete with a different item ID',
        terminalType: 'response.incomplete',
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
      {
        name: 'in-progress with a different item ID',
        terminalType: 'response.in_progress',
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
      {
        name: 'failed with a different item ID',
        terminalType: 'response.failed',
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
      {
        name: 'cancelled with a different item ID',
        terminalType: 'response.cancelled',
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
      {
        name: 'completed with a different item ID',
        terminalType: 'response.completed',
        annotationOutputIndex: 0,
        annotationItemId: 'm_other',
      },
    ])('never attaches an index-mismatched streamed citation after $name', async ({
      terminalType,
      annotationOutputIndex,
      annotationItemId,
    }) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://wrong.example',
        title: 'Wrong',
        start_index: 0,
        end_index: 6,
      };
      const item = {
        type: 'message',
        id: 'm_1',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item },
          {
            type: 'response.output_text.annotation.added',
            output_index: annotationOutputIndex,
            content_index: 0,
            item_id: annotationItemId,
            annotation_index: 0,
            annotation,
          },
          ...(terminalType
            ? [
                {
                  type: terminalType,
                  response: {
                    status: terminalType.slice('response.'.length),
                    output: [item],
                  },
                },
              ]
            : []),
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor(processCalls).processResponseOutput(
        parsed,
        {},
        false,
      );

      expect(parsed.output).toEqual([item]);
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.raw)).not.toContain('wrong.example');
    });

    it('preserves a matching streamed citation and finalized text after a truncated stream', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm_1',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
            },
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
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
          type: 'message',
          id: 'm_1',
          content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [annotation] }],
        }),
      ]);
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations).toEqual([annotation]);
    });

    it.each([
      {
        name: 'incomplete with a different item ID',
        terminalType: 'response.incomplete',
        annotationOutputIndex: 0,
        annotationItemId: 'm_secret',
      },
      {
        name: 'in-progress with a different item ID',
        terminalType: 'response.in_progress',
        annotationOutputIndex: 0,
        annotationItemId: 'm_secret',
      },
      {
        name: 'failed with a different item ID',
        terminalType: 'response.failed',
        annotationOutputIndex: 0,
        annotationItemId: 'm_secret',
      },
      {
        name: 'cancelled with a different item ID',
        terminalType: 'response.cancelled',
        annotationOutputIndex: 0,
        annotationItemId: 'm_secret',
      },
      {
        name: 'completed with a different item ID',
        terminalType: 'response.completed',
        annotationOutputIndex: 0,
        annotationItemId: 'm_secret',
      },
      {
        name: 'incomplete with a different output index',
        terminalType: 'response.incomplete',
        annotationOutputIndex: 1,
        annotationItemId: 'm_safe',
      },
      {
        name: 'in-progress with a different output index',
        terminalType: 'response.in_progress',
        annotationOutputIndex: 1,
        annotationItemId: 'm_safe',
      },
      {
        name: 'failed with a different output index',
        terminalType: 'response.failed',
        annotationOutputIndex: 1,
        annotationItemId: 'm_safe',
      },
      {
        name: 'cancelled with a different output index',
        terminalType: 'response.cancelled',
        annotationOutputIndex: 1,
        annotationItemId: 'm_safe',
      },
      {
        name: 'completed with a different output index',
        terminalType: 'response.completed',
        annotationOutputIndex: 1,
        annotationItemId: 'm_safe',
      },
    ])('never attaches a conflicting citation to a terminal-only message after $name', async ({
      terminalType,
      annotationOutputIndex,
      annotationItemId,
    }) => {
      const item = {
        type: 'message',
        id: 'm_safe',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'SAFE TERMINAL TEXT', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: annotationOutputIndex,
            content_index: 0,
            item_id: annotationItemId,
            annotation_index: 0,
            annotation: {
              type: 'url_citation',
              url: 'https://wrong.example/SECRET',
              title: 'SECRET SOURCE',
              start_index: 0,
              end_index: 6,
            },
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [item],
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

      expect(parsed.output).toEqual([item]);
      expect(processed.output).toBe('SAFE TERMINAL TEXT');
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.raw)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    });

    it.each([
      'response.incomplete',
      'response.in_progress',
      'response.failed',
      'response.cancelled',
      'response.completed',
    ])('preserves a matching citation and terminal-only text after %s', async (terminalType) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const item = {
        type: 'message',
        id: 'm_safe',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'SAFE TERMINAL TEXT', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation,
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [item],
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

      expect(parsed.output).toEqual([
        {
          ...item,
          content: [{ type: 'output_text', text: 'SAFE TERMINAL TEXT', annotations: [annotation] }],
        },
      ]);
      expect(processed.output).toBe('SAFE TERMINAL TEXT');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'incomplete with the same item ID at a different index',
        terminalType: 'response.incomplete',
        mode: 'index',
      },
      {
        name: 'in-progress with the same item ID at a different index',
        terminalType: 'response.in_progress',
        mode: 'index',
      },
      {
        name: 'failed with the same item ID at a different index',
        terminalType: 'response.failed',
        mode: 'index',
      },
      {
        name: 'cancelled with the same item ID at a different index',
        terminalType: 'response.cancelled',
        mode: 'index',
      },
      {
        name: 'completed with the same item ID at a different index',
        terminalType: 'response.completed',
        mode: 'index',
      },
      {
        name: 'incomplete with a different item ID at the same index',
        terminalType: 'response.incomplete',
        mode: 'item-id',
      },
      {
        name: 'in-progress with a different item ID at the same index',
        terminalType: 'response.in_progress',
        mode: 'item-id',
      },
      {
        name: 'failed with a different item ID at the same index',
        terminalType: 'response.failed',
        mode: 'item-id',
      },
      {
        name: 'cancelled with a different item ID at the same index',
        terminalType: 'response.cancelled',
        mode: 'item-id',
      },
      {
        name: 'completed with a different item ID at the same index',
        terminalType: 'response.completed',
        mode: 'item-id',
      },
    ])('rejects a citation when finalized and terminal message identities contradict after $name', async ({
      terminalType,
      mode,
    }) => {
      const finalizedItem = {
        type: 'message',
        id: 'm_final',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'FINALIZED SAFE', annotations: [] }],
      };
      const terminalOutput =
        mode === 'index'
          ? [
              {
                type: 'message',
                id: 'm_other',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'OTHER SAFE', annotations: [] }],
              },
              {
                type: 'message',
                id: 'm_final',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'TERMINAL SAFE', annotations: [] }],
              },
            ]
          : [
              {
                type: 'message',
                id: 'm_terminal',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'TERMINAL SAFE', annotations: [] }],
              },
            ];
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item: finalizedItem },
          {
            type: 'response.output_text.annotation.added',
            output_index: mode === 'index' ? 1 : 0,
            content_index: 0,
            item_id: mode === 'index' ? 'm_final' : 'm_terminal',
            annotation_index: 0,
            annotation: {
              type: 'url_citation',
              url: 'https://wrong.example/SECRET',
              title: 'SECRET SOURCE',
              start_index: 0,
              end_index: 6,
            },
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: terminalOutput,
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

      expect(
        parsed.output?.filter((item: any) => item?.id === 'm_final').length ?? 0,
      ).toBeLessThanOrEqual(1);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.raw)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
    });

    it.each([
      'response.incomplete',
      'response.in_progress',
      'response.failed',
      'response.cancelled',
      'response.completed',
    ])('preserves a citation when finalized and terminal identities agree after %s', async (terminalType) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const item = {
        type: 'message',
        id: 'm_final',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'CONSISTENT SAFE', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_final',
            annotation_index: 0,
            annotation,
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [item],
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

      expect(parsed.output).toEqual([
        {
          ...item,
          content: [{ type: 'output_text', text: 'CONSISTENT SAFE', annotations: [annotation] }],
        },
      ]);
      expect(processed.output).toBe('CONSISTENT SAFE');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'incomplete with the same item ID at different finalized indices',
        terminalType: 'response.incomplete',
        mode: 'index',
      },
      {
        name: 'in-progress with the same item ID at different finalized indices',
        terminalType: 'response.in_progress',
        mode: 'index',
      },
      {
        name: 'failed with the same item ID at different finalized indices',
        terminalType: 'response.failed',
        mode: 'index',
      },
      {
        name: 'cancelled with the same item ID at different finalized indices',
        terminalType: 'response.cancelled',
        mode: 'index',
      },
      {
        name: 'completed with the same item ID at different finalized indices',
        terminalType: 'response.completed',
        mode: 'index',
      },
      {
        name: 'incomplete with different item IDs at the same finalized index',
        terminalType: 'response.incomplete',
        mode: 'item-id',
      },
      {
        name: 'in-progress with different item IDs at the same finalized index',
        terminalType: 'response.in_progress',
        mode: 'item-id',
      },
      {
        name: 'failed with different item IDs at the same finalized index',
        terminalType: 'response.failed',
        mode: 'item-id',
      },
      {
        name: 'cancelled with different item IDs at the same finalized index',
        terminalType: 'response.cancelled',
        mode: 'item-id',
      },
      {
        name: 'completed with different item IDs at the same finalized index',
        terminalType: 'response.completed',
        mode: 'item-id',
      },
    ])('rejects a citation when finalized message snapshots contradict after $name', async ({
      terminalType,
      mode,
    }) => {
      const firstId = mode === 'index' ? 'm_final' : 'm_first';
      const secondId = mode === 'index' ? 'm_final' : 'm_second';
      const secondIndex = mode === 'index' ? 1 : 0;
      const terminalItem = {
        type: 'message',
        id: firstId,
        role: 'assistant',
        content: [{ type: 'output_text', text: 'TERMINAL SAFE', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: firstId,
              role: 'assistant',
              content: [{ type: 'output_text', text: 'FIRST FINAL', annotations: [] }],
            },
          },
          {
            type: 'response.output_item.done',
            output_index: secondIndex,
            item: {
              type: 'message',
              id: secondId,
              role: 'assistant',
              content: [{ type: 'output_text', text: 'SECOND FINAL', annotations: [] }],
            },
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: secondIndex,
            content_index: 0,
            item_id: secondId,
            annotation_index: 0,
            annotation: {
              type: 'url_citation',
              url: 'https://wrong.example/SECRET',
              title: 'SECRET SOURCE',
              start_index: 0,
              end_index: 6,
            },
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [terminalItem],
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

      expect(
        parsed.output?.filter((item: any) => item?.id === firstId).length ?? 0,
      ).toBeLessThanOrEqual(1);
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.raw)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('SECOND FINAL');
      expect(JSON.stringify(processed.raw)).not.toContain('SECOND FINAL');
    });

    it.each([
      'response.incomplete',
      'response.in_progress',
      'response.failed',
      'response.cancelled',
      'response.completed',
    ])('preserves a citation when repeated finalized snapshots agree after %s', async (terminalType) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/repeated',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const item = {
        type: 'message',
        id: 'm_consistent',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'CONSISTENT SAFE', annotations: [] }],
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.output_item.done', output_index: 0, item },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_consistent',
            annotation_index: 0,
            annotation,
          },
          {
            type: terminalType,
            response: {
              status: terminalType.slice('response.'.length),
              output: [item],
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

      expect(parsed.output).toEqual([
        {
          ...item,
          content: [{ type: 'output_text', text: 'CONSISTENT SAFE', annotations: [annotation] }],
        },
      ]);
      expect(processed.output).toBe('CONSISTENT SAFE');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'the same item ID at different finalized indices',
        mode: 'index',
      },
      {
        name: 'different item IDs at the same finalized index',
        mode: 'item-id',
      },
    ])('rejects a conflicting citation from text.done-only output at EOF with $name', async ({
      mode,
    }) => {
      const firstId = 'm_first';
      const secondId = mode === 'index' ? firstId : 'm_second';
      const secondIndex = mode === 'index' ? 1 : 0;
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: firstId,
            text: 'FIRST FINAL',
          },
          {
            type: 'response.output_text.done',
            output_index: secondIndex,
            content_index: 0,
            item_id: secondId,
            text: 'SECOND FINAL',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: secondIndex,
            content_index: 0,
            item_id: secondId,
            annotation_index: 0,
            annotation: {
              type: 'url_citation',
              url: 'https://wrong.example/SECRET',
              title: 'SECRET SOURCE',
              start_index: 0,
              end_index: 6,
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

      expect(parsed.output).toHaveLength(1);
      expect(processed.output).toBe('FIRST FINAL');
      expect(processed.metadata?.annotations ?? []).toEqual([]);
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('wrong.example');
      expect(JSON.stringify(processed.raw)).not.toContain('wrong.example');
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('SECOND FINAL');
      expect(JSON.stringify(processed.raw)).not.toContain('SECOND FINAL');
    });

    it('preserves a matching text.done-only citation at EOF', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/text-done',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SAFE FINAL',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation,
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

      expect(parsed.output).toEqual([
        {
          type: 'message',
          id: 'm_safe',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'SAFE FINAL', annotations: [annotation] }],
        },
      ]);
      expect(processed.output).toBe('SAFE FINAL');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(processCalls).not.toHaveBeenCalled();
    });

    it('never mixes unfinalized output-text deltas from conflicting item identities', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_safe',
            delta: 'SAFE ',
          },
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_secret',
            delta: 'SECRET_DRAFT ',
          },
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_safe',
            delta: 'FINAL',
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor(processCalls).processResponseOutput(
        parsed,
        {},
        false,
      );

      expect(processed.output).toBe('SAFE FINAL');
      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('SECRET_DRAFT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET_DRAFT');
    });

    it('does not let an empty refusal.done replace a completed answer', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.refusal.done',
            output_index: 0,
            content_index: 0,
            refusal: '',
          },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL ANSWER' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).not.toBe(true);
      expect(processed.output).toBe('SAFE FINAL ANSWER');
      expect(JSON.stringify(parsed)).not.toContain('refusal');
    });

    it.each([
      { name: 'annotation-only', includeText: false, expected: '' },
      { name: 'annotation and text.done', includeText: true, expected: 'ANSWER' },
    ])('never exposes undefined for a sparse $name output-text slot', async ({
      includeText,
      expected,
    }) => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/sparse-slot',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 1,
            item_id: 'm_sparse',
            annotation_index: 0,
            annotation,
          },
          ...(includeText
            ? [
                {
                  type: 'response.output_text.done',
                  output_index: 0,
                  content_index: 1,
                  item_id: 'm_sparse',
                  text: 'ANSWER',
                },
              ]
            : []),
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.error).toBeUndefined();
      expect(processed.output).toBe(expected);
      expect(String(processed.output)).not.toContain('undefined');
      expect(JSON.stringify(parsed)).not.toContain('"text":null');
      expect(processed.metadata?.annotations).toEqual([annotation]);
    });

    it.each([
      {
        name: 'ignored SSE event',
        event: (payload: string) => ({
          type: 'response.unknown',
          output_index: 0,
          item_id: 'fc_1',
          delta: payload,
        }),
      },
      {
        name: 'function-argument delta',
        event: (payload: string) => ({
          type: 'response.function_call_arguments.delta',
          output_index: 0,
          item_id: 'fc_1',
          delta: payload,
        }),
      },
      {
        name: 'audio-only content-part-added event',
        event: (payload: string) => ({
          type: 'response.content_part.added',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_audio', audio: payload },
        }),
      },
      {
        name: 'audio-only output-item-added event',
        event: (payload: string) => ({
          type: 'response.output_item.added',
          output_index: 0,
          item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_audio', audio: payload }],
          },
        }),
      },
      {
        name: 'malformed annotation event',
        event: (payload: string) => ({
          type: 'response.output_text.annotation.added',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          annotation_index: 0,
          annotation: payload,
        }),
      },
      {
        name: 'malformed refusal delta',
        event: (payload: string) => ({
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          delta: { raw: payload },
        }),
      },
      {
        name: 'malformed output-text-done event',
        event: (payload: string) => ({
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          text: { raw: payload },
        }),
      },
      {
        name: 'nonterminal response snapshot with ignored payload',
        event: (payload: string) => ({
          type: 'response.in_progress',
          response: { status: 'in_progress', junk: payload },
        }),
      },
      {
        name: 'empty output snapshot with ignored payload',
        event: (payload: string) => ({
          type: 'response.unknown',
          output: [],
          junk: payload,
        }),
      },
      {
        name: 'invalid-item response snapshot with ignored payload',
        event: (payload: string) => ({
          type: 'response.in_progress',
          response: { status: 'in_progress', output: [{}], junk: payload },
        }),
      },
      {
        name: 'invalid-item output snapshot with ignored payload',
        event: (payload: string) => ({
          type: 'response.unknown',
          output: [{}],
          junk: payload,
        }),
      },
      {
        name: 'audio-only response snapshot',
        event: (payload: string) => ({
          type: 'response.in_progress',
          response: {
            status: 'in_progress',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_audio', audio: payload }],
              },
            ],
          },
        }),
      },
      {
        name: 'valid-text response snapshot with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.in_progress',
          response: {
            status: 'in_progress',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'x' }],
              },
            ],
            junk: payload,
          },
        }),
      },
      {
        name: 'output-text delta with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.output_text.delta',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          delta: 'x',
          junk: payload,
        }),
      },
      {
        name: 'output-text-done event with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm_1',
          text: 'x',
          junk: payload,
        }),
      },
      {
        name: 'content-part-added event with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.content_part.added',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: 'x', junk: payload },
        }),
      },
      {
        name: 'content-part-done event with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.content_part.done',
          output_index: 0,
          content_index: 0,
          part: { type: 'output_text', text: 'x', junk: payload },
        }),
      },
      {
        name: 'function-argument-done event with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.function_call_arguments.done',
          output_index: 0,
          item_id: 'fc_1',
          arguments: '{}',
          junk: payload,
        }),
      },
      {
        name: 'refusal delta with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.refusal.delta',
          output_index: 0,
          content_index: 0,
          delta: 'x',
          junk: payload,
        }),
      },
      {
        name: 'function-call-added event with oversized ignored metadata',
        event: (payload: string) => ({
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: payload },
        }),
      },
      {
        name: 'output-item-done event with ignored sibling payload',
        event: (payload: string) => ({
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            id: 'm_1',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'x' }],
            junk: payload,
          },
        }),
      },
    ])('cancels a Responses stream when cumulative $name bytes exceed the bound', async ({
      event,
    }) => {
      const encoder = new TextEncoder();
      const payload = 'x'.repeat(1024 * 1024);
      let sent = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 48) {
            controller.enqueue(
              encoder.encode(
                'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SAFE"}]}]}}\n\n',
              ),
            );
            controller.close();
            return;
          }
          sent++;
          const payloadEvent = event(payload);
          controller.enqueue(
            encoder.encode(
              `event: ${payloadEvent.type}\ndata: ${JSON.stringify(payloadEvent)}\n\n`,
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*(input|ignored|output)/i);
      expect(sent).toBeLessThan(48);
      expect(cancelled).toBe(true);
    });

    it.each([
      {
        name: 'late output-text-done event',
        late: true,
        event: (text: string) => ({
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm',
          text,
        }),
      },
      {
        name: 'late function-argument-done event',
        late: true,
        event: (text: string) => ({
          type: 'response.function_call_arguments.done',
          output_index: 0,
          item_id: 'fc',
          arguments: text,
        }),
      },
      {
        name: 'late output-item-done event',
        late: true,
        event: (text: string) => ({
          type: 'response.output_item.done',
          output_index: 0,
          item: {
            type: 'message',
            id: 'm',
            role: 'assistant',
            content: [{ type: 'output_text', text }],
          },
        }),
      },
      {
        name: 'late response snapshot',
        late: true,
        event: (text: string) => ({
          type: 'response.in_progress',
          response: {
            status: 'in_progress',
            output: [
              {
                type: 'message',
                id: 'm',
                role: 'assistant',
                content: [{ type: 'output_text', text }],
              },
            ],
          },
        }),
      },
      {
        name: 'repeated nonterminal response snapshot',
        late: false,
        event: (text: string) => ({
          type: 'response.in_progress',
          response: {
            status: 'in_progress',
            output: [
              {
                type: 'message',
                id: 'm',
                role: 'assistant',
                content: [{ type: 'output_text', text }],
              },
            ],
          },
        }),
      },
      {
        name: 'repeated output-text-done event',
        late: false,
        event: (text: string) => ({
          type: 'response.output_text.done',
          output_index: 0,
          content_index: 0,
          item_id: 'm',
          text,
        }),
      },
      {
        name: 'invalid function-argument identity',
        late: false,
        event: (text: string) => ({
          type: 'response.function_call_arguments.done',
          output_index: '0:function_call:a',
          item_id: 'b',
          arguments: text,
        }),
      },
      {
        name: 'invalid function-call item arguments',
        late: false,
        event: (text: string) => ({
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'function_call', id: 'bad', arguments: text },
        }),
      },
    ])('cancels a Responses stream when $name replays ignored retained payloads', async ({
      event,
      late,
    }) => {
      const encoder = new TextEncoder();
      const text = 'X'.repeat(7 * 1024 * 1024);
      const completed =
        'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","id":"safe","role":"assistant","content":[{"type":"output_text","text":"SAFE"}]}]}}\n\n';
      let sent = 0;
      let terminalSent = false;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (late && !terminalSent) {
            terminalSent = true;
            controller.enqueue(encoder.encode(completed));
            return;
          }
          if (sent >= 12) {
            controller.enqueue(encoder.encode(completed));
            controller.close();
            return;
          }
          sent++;
          const payloadEvent = event(text);
          controller.enqueue(
            encoder.encode(
              `event: ${payloadEvent.type}\ndata: ${JSON.stringify(payloadEvent)}\n\n`,
            ),
          );
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*(?:unretained|total).*stream input/i);
      expect(sent).toBeLessThan(12);
      expect(cancelled).toBe(true);
    });

    it('cancels a Responses stream at the hard input ceiling when snapshot kinds evade retained repetition tracking', async () => {
      const encoder = new TextEncoder();
      const text = 'X'.repeat(7 * 1024 * 1024);
      let sent = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent >= 16) {
            controller.enqueue(
              encoder.encode(
                'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SAFE"}]}]}}\n\n',
              ),
            );
            controller.close();
            return;
          }
          sent++;
          const event = {
            type: `response.snapshot_${sent}`,
            response: {
              status: 'in_progress',
              output: [
                {
                  type: 'message',
                  id: 'm',
                  role: 'assistant',
                  content: [{ type: 'output_text', text }],
                },
              ],
            },
          };
          controller.enqueue(
            encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
          );
        },
        cancel() {
          cancelled = true;
        },
      });

      await expect(
        readResponsesStream(new Response(stream), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/streaming response exceeded.*total stream input/i);
      expect(sent).toBeLessThan(16);
      expect(cancelled).toBe(true);
    });

    it('executes a completed function call with empty string arguments', async () => {
      const processCalls = vi.fn().mockResolvedValue('SAFE TOOL RESULT');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'function_call',
                  status: 'completed',
                  name: 'lookup',
                  arguments: '',
                  call_id: 'call_empty',
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

      expect(parsed.output).toEqual([
        expect.objectContaining({
          type: 'function_call',
          status: 'completed',
          name: 'lookup',
          arguments: '',
          call_id: 'call_empty',
        }),
      ]);
      expect(processCalls).toHaveBeenCalledOnce();
      expect(processed.output).toBe('SAFE TOOL RESULT');
      expect(processed.error).toBeUndefined();
    });

    it.each([
      {
        name: 'statusless incomplete after output_text.done',
        eventType: 'response.incomplete',
        finalizer: 'text',
        includeStatus: false,
      },
      {
        name: 'statusless incomplete after output_item.done',
        eventType: 'response.incomplete',
        finalizer: 'item',
        includeStatus: false,
      },
      {
        name: 'statusless in-progress at EOF after output_text.done',
        eventType: 'response.in_progress',
        finalizer: 'text',
        includeStatus: false,
      },
      {
        name: 'statusless in-progress at EOF after output_item.done',
        eventType: 'response.in_progress',
        finalizer: 'item',
        includeStatus: false,
      },
      {
        name: 'status-present incomplete after output_text.done',
        eventType: 'response.incomplete',
        finalizer: 'text',
        includeStatus: true,
      },
      {
        name: 'status-present incomplete after output_item.done',
        eventType: 'response.incomplete',
        finalizer: 'item',
        includeStatus: true,
      },
    ])('keeps finalized text authoritative for $name', async ({
      eventType,
      finalizer,
      includeStatus,
    }) => {
      const finalized =
        finalizer === 'text'
          ? {
              type: 'response.output_text.done',
              output_index: 0,
              content_index: 0,
              item_id: 'm_1',
              text: 'SAFE FINAL TEXT',
            }
          : {
              type: 'response.output_item.done',
              output_index: 0,
              item: {
                type: 'message',
                id: 'm_1',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'SAFE FINAL TEXT' }],
              },
            };
      const parsed = await readResponsesStream(
        createSseResponse([
          finalized,
          {
            type: eventType,
            response: {
              ...(includeStatus
                ? { status: eventType === 'response.incomplete' ? 'incomplete' : 'in_progress' }
                : {}),
              output: [
                {
                  type: 'message',
                  id: 'm_1',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET TERMINAL DRAFT' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(JSON.stringify(parsed)).not.toContain('SECRET TERMINAL DRAFT');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET TERMINAL DRAFT');
    });

    it('keeps citations and finalized text while stripping a statusless in-progress tool draft', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 1,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SAFE FINAL TEXT',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 1,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation,
          },
          {
            type: 'response.in_progress',
            response: {
              output: [
                {
                  type: 'function_call',
                  call_id: 'call_dangerous',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                },
                {
                  type: 'message',
                  id: 'm_safe',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET TERMINAL DRAFT' }],
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
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET TERMINAL DRAFT');
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it('never executes a finalized function call explicitly marked incomplete', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'function_call',
              id: 'fc_incomplete',
              call_id: 'call_incomplete',
              name: 'dangerous_action',
              arguments: '{"path":"/tmp/secret"}',
              status: 'incomplete',
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it('never borrows added function-call metadata across colliding colon identities', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.added',
            output_index: '0:function_call:a',
            item: {
              type: 'function_call',
              id: 'b',
              call_id: 'safe_call',
              name: 'dangerous_action',
            },
          },
          {
            type: 'response.function_call_arguments.done',
            output_index: '0',
            item_id: 'a:function_call:b',
            arguments: '{"path":"/tmp/secret"}',
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it('never reconciles a call-id-only output item across colliding colon identities', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.function_call_arguments.done',
            output_index: '0:function_call:a',
            item_id: 'b',
            name: 'dangerous_action',
            arguments: '{"path":"/tmp/secret"}',
          },
          {
            type: 'response.output_item.done',
            output_index: '0',
            item: {
              type: 'function_call',
              call_id: 'safe_call',
              name: 'dangerous_action',
              arguments: '',
            },
          },
          { type: 'response.incomplete', response: { status: 'incomplete', output: [] } },
        ]),
        'test',
        { debug: vi.fn() },
      );
      await createProcessor(processCalls).processResponseOutput(parsed, {}, false);

      expect(processCalls).not.toHaveBeenCalled();
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
      expect(JSON.stringify(parsed)).not.toContain('/tmp/secret');
    });

    it('executes a legitimately matched function call with colon-delimited identities', async () => {
      const processCalls = vi.fn().mockResolvedValue('SAFE TOOL RESULT');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_item.added',
            output_index: '0:function_call:a',
            item: { type: 'function_call', id: 'b', call_id: 'safe_call', name: 'lookup' },
          },
          {
            type: 'response.function_call_arguments.done',
            output_index: '0:function_call:a',
            item_id: 'b',
            arguments: '{"q":"safe"}',
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  id: 'b',
                  call_id: 'safe_call',
                  name: 'lookup',
                  arguments: '{"q":',
                  status: 'in_progress',
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

      expect(processCalls).toHaveBeenCalledTimes(1);
      expect(processCalls).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'function_call',
          id: 'b',
          call_id: 'safe_call',
          name: 'lookup',
          arguments: '{"q":"safe"}',
        }),
        undefined,
      );
      expect(processed.output).toBe('SAFE TOOL RESULT');
    });

    it.each([
      { name: 'completed content-part snapshot', status: 'completed', snapshot: 'part' },
      { name: 'incomplete content-part snapshot', status: 'incomplete', snapshot: 'part' },
      { name: 'completed output-item snapshot', status: 'completed', snapshot: 'item' },
      { name: 'incomplete output-item snapshot', status: 'incomplete', snapshot: 'item' },
    ])('preserves indexed citations after a later $name', async ({ status, snapshot }) => {
      const annotations = [
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
      const laterSnapshot =
        snapshot === 'part'
          ? {
              type: 'response.content_part.done',
              output_index: 0,
              content_index: 0,
              item_id: 'm_1',
              part: { type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] },
            }
          : {
              type: 'response.output_item.done',
              output_index: 0,
              item: {
                type: 'message',
                id: 'm_1',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
              },
            };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            annotation_index: 1,
            annotation: annotations[1],
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            annotation_index: 0,
            annotation: annotations[0],
          },
          laterSnapshot,
          {
            type: `response.${status}`,
            response: {
              status,
              output: [
                {
                  type: 'message',
                  id: 'm_1',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL TEXT', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual(annotations);
      expect(processed.metadata?.annotations).toEqual(annotations);
      expect(parsed.output?.[0]?.content?.[0]?.text).toBe('SAFE FINAL TEXT');
    });

    it.each([
      { name: 'normal append', indices: [0, 1, -1], values: [0, 1, 2] },
      { name: 'sparse append', indices: [0, 2, -1], values: [0, 1, 2] },
      { name: 'duplicate sparse append', indices: [0, 2, 2, -1], values: [0, 1, 1, 2] },
    ])('preserves every citation for a $name annotation sequence', async ({ indices, values }) => {
      const annotations = [
        {
          type: 'url_citation',
          url: 'https://example.test/a',
          title: 'A',
          start_index: 0,
          end_index: 1,
        },
        {
          type: 'url_citation',
          url: 'https://example.test/b',
          title: 'B',
          start_index: 2,
          end_index: 3,
        },
        {
          type: 'url_citation',
          url: 'https://example.test/c',
          title: 'C',
          start_index: 4,
          end_index: 5,
        },
      ];
      const parsed = await readResponsesStream(
        createSseResponse([
          ...indices.map((annotationIndex, eventIndex) => ({
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            annotation_index: annotationIndex,
            annotation: annotations[values[eventIndex]],
          })),
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            text: 'A B C',
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
                  content: [{ type: 'output_text', text: 'A B C', annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual(annotations);
      expect(processed.metadata?.annotations).toEqual(annotations);
    });

    it('keeps malformed colon-delimited annotation identities distinct', async () => {
      const first = {
        type: 'url_citation',
        url: 'https://example.test/first',
        title: 'First',
        start_index: 0,
        end_index: 1,
      };
      const second = {
        type: 'url_citation',
        url: 'https://example.test/second',
        title: 'Second',
        start_index: 0,
        end_index: 1,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: '0:message:a',
            content_index: 0,
            item_id: 'b',
            annotation_index: 0,
            annotation: first,
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: '0',
            content_index: 0,
            item_id: 'a:message:b',
            annotation_index: 0,
            annotation: second,
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'message',
                  id: 'b',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'FIRST' }],
                },
                {
                  type: 'message',
                  id: 'a:message:b',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECOND' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const byId = new Map<string, any>(parsed.output.map((item: any) => [item.id, item]));

      expect(byId.get('b')?.content?.[0]?.annotations).toEqual([first]);
      expect(byId.get('a:message:b')?.content?.[0]?.annotations).toEqual([second]);
    });

    it('rejects a malformed append when the bounded annotation suffix is exhausted', async () => {
      await expect(
        readResponsesStream(
          createSseResponse([
            {
              type: 'response.output_text.annotation.added',
              output_index: 0,
              content_index: 0,
              item_id: 'm_1',
              annotation_index: 8192,
              annotation: { type: 'url_citation', url: 'https://example.test/last' },
            },
            {
              type: 'response.output_text.annotation.added',
              output_index: 0,
              content_index: 0,
              item_id: 'm_1',
              annotation_index: -1,
              annotation: { type: 'url_citation', url: 'https://example.test/overflow' },
            },
          ]),
          'test',
          { debug: vi.fn() },
        ),
      ).rejects.toThrow(/exceeded.*annotation slots/i);
    });

    it('fails closed on a bounded annotation-event flood', async () => {
      const events = Array.from({ length: 8193 }, (_unused, annotationIndex) => ({
        type: 'response.output_text.annotation.added',
        output_index: 0,
        content_index: 0,
        item_id: 'm_1',
        annotation_index: annotationIndex,
        annotation: {
          type: 'url_citation',
          url: `https://example.test/${annotationIndex}`,
          title: `Citation ${annotationIndex}`,
          start_index: annotationIndex,
          end_index: annotationIndex + 1,
        },
      }));

      await expect(
        readResponsesStream(createSseResponse(events), 'test', { debug: vi.fn() }),
      ).rejects.toThrow(/exceeded.*annotation/i);
    }, 20_000);

    it('does not retain oversized annotation item identifiers', async () => {
      const oversizedItemId = 'x'.repeat(4097);
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.annotation.added',
            output_index: 0,
            content_index: 0,
            item_id: oversizedItemId,
            annotation_index: 0,
            annotation,
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(JSON.stringify(parsed)).not.toContain(oversizedItemId);
      expect(parsed.output?.[0]?.content?.[0]?.annotations).toEqual([annotation]);
    });

    it('accepts a valid nine-mebibyte output-text snapshot with empty annotations', async () => {
      const text = 'A'.repeat(9 * 1024 * 1024);
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            text,
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'message',
              id: 'm_1',
              role: 'assistant',
              content: [{ type: 'output_text', text, annotations: [] }],
            },
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
                  content: [{ type: 'output_text', text, annotations: [] }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output?.[0]?.content?.[0]?.text).toHaveLength(9 * 1024 * 1024);
    });

    it.each([
      7, 8, 16,
    ])('accepts a valid %i-mebibyte output text repeated across final stream snapshots', async (mebibytes) => {
      const text = 'A'.repeat(mebibytes * 1024 * 1024);
      const item = {
        type: 'message',
        id: 'm_1',
        role: 'assistant',
        content: [{ type: 'output_text', text }],
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            delta: text,
          },
          {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            text,
          },
          {
            type: 'response.content_part.done',
            output_index: 0,
            content_index: 0,
            item_id: 'm_1',
            part: { type: 'output_text', text },
          },
          { type: 'response.output_item.done', output_index: 0, item },
          { type: 'response.completed', response: { status: 'completed', output: [item] } },
        ]),
        'test',
        { debug: vi.fn() },
      );

      expect(parsed.output?.[0]?.content?.[0]?.text).toHaveLength(mebibytes * 1024 * 1024);
    });

    it('does not let an empty refusal delta replace a completed answer', async () => {
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.refusal.delta',
            output_index: 0,
            content_index: 0,
            delta: '',
          },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SAFE FINAL ANSWER' }],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false);

      expect(processed.isRefusal).not.toBe(true);
      expect(processed.output).toBe('SAFE FINAL ANSWER');
      expect(JSON.stringify(parsed)).not.toContain('refusal');
    });

    it('scrubs all finalized non-refusal drafts from refusal raw output and metadata', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/SECRET-CITATION',
        title: 'SECRET CITATION',
        start_index: 0,
        end_index: 6,
      };
      const parsed = await readResponsesStream(
        createSseResponse([
          { type: 'response.refusal.done', output_index: 2, content_index: 0, refusal: 'Blocked' },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
              type: 'reasoning',
              id: 'rs_1',
              summary: [{ type: 'summary_text', text: 'SECRET REASONING DRAFT' }],
            },
          },
          {
            type: 'response.output_item.done',
            output_index: 1,
            item: {
              type: 'code_interpreter_call',
              id: 'ci_1',
              status: 'completed',
              code: 'print("SECRET CODE DRAFT")',
              outputs: [],
            },
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 2,
            content_index: 0,
            item_id: 'm_1',
            annotation_index: 0,
            annotation,
          },
          {
            type: 'response.completed',
            response: {
              status: 'completed',
              output: [
                {
                  type: 'reasoning',
                  id: 'rs_1',
                  summary: [{ type: 'summary_text', text: 'SECRET REASONING DRAFT' }],
                },
                {
                  type: 'code_interpreter_call',
                  id: 'ci_1',
                  status: 'completed',
                  code: 'print("SECRET CODE DRAFT")',
                  outputs: [],
                },
                {
                  type: 'message',
                  id: 'm_1',
                  role: 'assistant',
                  content: [
                    { type: 'output_text', text: 'SECRET TEXT DRAFT', annotations: [annotation] },
                  ],
                },
              ],
            },
          },
        ]),
        'test',
        { debug: vi.fn() },
      );
      const processed = await createProcessor().processResponseOutput(parsed, {}, false, {
        suppressReasoningOutput: true,
      });

      expect(processed.isRefusal).toBe(true);
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(processed.raw)).not.toContain('SECRET');
      expect(JSON.stringify(processed.metadata)).not.toContain('SECRET');
    });

    it('keeps finalized message text and citations aligned after an unfinalized tool is removed', async () => {
      const annotation = {
        type: 'url_citation',
        url: 'https://example.test/safe',
        title: 'Safe',
        start_index: 0,
        end_index: 4,
      };
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 1,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SAFE FINAL TEXT',
          },
          {
            type: 'response.output_text.annotation.added',
            output_index: 1,
            content_index: 0,
            item_id: 'm_safe',
            annotation_index: 0,
            annotation,
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  call_id: 'call_dangerous',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                },
                {
                  type: 'message',
                  id: 'm_safe',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET TEXT DRAFT' }],
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
          id: 'm_safe',
          content: [
            expect.objectContaining({
              type: 'output_text',
              text: 'SAFE FINAL TEXT',
              annotations: [annotation],
            }),
          ],
        }),
      ]);
      expect(processed.metadata?.annotations).toEqual([annotation]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
    });

    it('replaces a single shifted message draft after an unfinalized tool is removed', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 1,
            content_index: 0,
            item_id: 'm_safe',
            text: 'SAFE FINAL TEXT',
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  call_id: 'call_dangerous',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                },
                {
                  type: 'message',
                  id: 'm_safe',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET TEXT DRAFT' }],
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
      expect(processed.output).toBe('SAFE FINAL TEXT');
      expect(parsed.output).toEqual([
        expect.objectContaining({
          id: 'm_safe',
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FINAL TEXT' })],
        }),
      ]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
    });

    it('replaces two shifted message drafts after an unfinalized tool is removed', async () => {
      const processCalls = vi.fn().mockResolvedValue('executed');
      const parsed = await readResponsesStream(
        createSseResponse([
          {
            type: 'response.output_text.done',
            output_index: 1,
            content_index: 0,
            item_id: 'm_first',
            text: 'SAFE FIRST',
          },
          {
            type: 'response.output_text.done',
            output_index: 2,
            content_index: 0,
            item_id: 'm_second',
            text: 'SAFE SECOND',
          },
          {
            type: 'response.incomplete',
            response: {
              status: 'incomplete',
              output: [
                {
                  type: 'function_call',
                  call_id: 'call_dangerous',
                  name: 'dangerous_action',
                  arguments: '{"path":"/tmp/secret"}',
                },
                {
                  type: 'message',
                  id: 'm_first',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET FIRST DRAFT' }],
                },
                {
                  type: 'message',
                  id: 'm_second',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: 'SECRET SECOND DRAFT' }],
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
      expect(processed.output).toBe('SAFE FIRST\nSAFE SECOND');
      expect(parsed.output).toEqual([
        expect.objectContaining({
          id: 'm_first',
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE FIRST' })],
        }),
        expect.objectContaining({
          id: 'm_second',
          content: [expect.objectContaining({ type: 'output_text', text: 'SAFE SECOND' })],
        }),
      ]);
      expect(JSON.stringify(parsed)).not.toContain('SECRET');
      expect(JSON.stringify(parsed)).not.toContain('dangerous_action');
    });
  });
});
