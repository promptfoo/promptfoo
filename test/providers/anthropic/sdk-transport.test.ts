import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { context, propagation, type SpanContext, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearCache } from '../../../src/cache';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { mockProcessEnv } from '../../util/utils';

import type { AnthropicMessageOptions } from '../../../src/providers/anthropic/types';
import type { EnvOverrides } from '../../../src/types/env';
import type { CallApiContextParams } from '../../../src/types/index';

const servers: Server[] = [];

type ServerOptions = {
  status?: 200 | 401;
  /** One stop reason per response, so a `pause_turn` first response makes the turn resume. */
  stopReasons?: string[];
};

function messagePayload(stopReason: string) {
  return {
    id: 'msg_local',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: 'pong' }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 3, output_tokens: 1 },
  };
}

function streamPayload(stopReason: string) {
  const { content, stop_reason, usage, ...message } = messagePayload(stopReason);
  const events = [
    {
      type: 'message_start',
      message: {
        ...message,
        content: [],
        stop_reason: null,
        usage: { ...usage, output_tokens: 0 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: content[0].text } },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: usage.output_tokens },
    },
    { type: 'message_stop' },
  ];
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

async function createMessagesServer({ status = 200, stopReasons = ['end_turn'] }: ServerOptions) {
  const requests: {
    method: string | undefined;
    url: string | undefined;
    apiKey: string | undefined;
    traceparent: string | undefined;
    tracestate: string | undefined;
    baggage: string | undefined;
    body: any;
  }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({
      method: request.method,
      url: request.url,
      apiKey: request.headers['x-api-key'] as string | undefined,
      traceparent: request.headers.traceparent as string | undefined,
      tracestate: request.headers.tracestate as string | undefined,
      baggage: request.headers.baggage as string | undefined,
      body,
    });
    const requestId = `req_local_${requests.length}`;

    if (status !== 200) {
      response.writeHead(status, { 'content-type': 'application/json', 'request-id': requestId });
      response.end(
        JSON.stringify({
          type: 'error',
          error: { type: 'authentication_error', message: 'bad key' },
        }),
      );
      return;
    }

    const stopReason = stopReasons[Math.min(requests.length, stopReasons.length) - 1];
    if (body.stream) {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'request-id': requestId });
      response.end(streamPayload(stopReason));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json', 'request-id': requestId });
    response.end(JSON.stringify(messagePayload(stopReason)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);

  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

function traceparentOf(spanContext: SpanContext) {
  return `00-${spanContext.traceId}-${spanContext.spanId}-01`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('Anthropic Messages SDK transport', () => {
  const exporter = new InMemorySpanExporter();
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  // The trace context the evaluator gives a traced test case's provider calls.
  const EVAL_TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
  const TEST_CASE_SPAN_ID = 'b7ad6b7169203331';
  const tracedCall: CallApiContextParams = {
    prompt: { raw: 'ping', label: 'ping' },
    vars: {},
    traceparent: `00-${EVAL_TRACE_ID}-${TEST_CASE_SPAN_ID}-01`,
  };
  let restoreEnv: () => void;

  beforeAll(() => {
    tracerProvider.register();
  });

  beforeEach(() => {
    exporter.reset();
    // An inherited SDK opt-out must not hide duplicate instrumentation.
    restoreEnv = mockProcessEnv({
      ANTHROPIC_OPEN_TELEMETRY: 'true',
      ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: undefined,
      ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE: undefined,
      ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  afterAll(async () => {
    try {
      await tracerProvider.shutdown();
    } finally {
      trace.disable();
      context.disable();
      propagation.disable();
    }
  });

  async function callProvider(
    config: AnthropicMessageOptions = {},
    {
      callContext = tracedCall,
      env,
      ...serverOptions
    }: ServerOptions & { callContext?: CallApiContextParams | null; env?: EnvOverrides } = {},
  ) {
    const { baseUrl, requests } = await createMessagesServer(serverOptions);
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      config: { apiKey: 'local-qa-key', apiBaseUrl: baseUrl, ...config },
      ...(env && { env }),
    });
    const result = await provider.callApi('ping', callContext ?? undefined);
    await tracerProvider.forceFlush();
    const spans = exporter.getFinishedSpans();
    const chatSpan = spans.find((span) => span.name === 'chat claude-sonnet-4-6');
    return { chatSpan, provider, requests, result, spans };
  }

  function sdkSpanOf(spans: ReadableSpan[]) {
    return spans.find((span) => span.name === 'anthropic.messages.create');
  }

  it('sends a request and parses a response through the installed SDK', async () => {
    const { chatSpan, provider, requests, result, spans } = await callProvider();

    expect(requests).toMatchObject([
      {
        method: 'POST',
        url: '/v1/messages',
        apiKey: 'local-qa-key',
        body: {
          model: 'claude-sonnet-4-6',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
        },
      },
    ]);
    expect(result).toMatchObject({ output: 'pong', tokenUsage: { prompt: 3, completion: 1 } });
    expect(spans).toMatchObject([
      {
        name: 'chat claude-sonnet-4-6',
        instrumentationScope: { name: 'promptfoo.providers' },
        attributes: {
          'promptfoo.provider.id': provider.id(),
          'gen_ai.request.max_tokens': 1024,
          'gen_ai.request.temperature': 0,
          'gen_ai.response.id': 'msg_local',
          'gen_ai.response.model': 'claude-sonnet-4-6',
          'gen_ai.usage.input_tokens': 3,
          'gen_ai.usage.output_tokens': 1,
          'anthropic.message.stop_reason': 'end_turn',
          'anthropic.request.id': 'req_local_1',
        },
        status: { code: SpanStatusCode.OK },
      },
    ]);
    // Claude API tracing places the API's spans under the span this header names.
    expect(requests[0].traceparent).toBe(traceparentOf(chatSpan!.spanContext()));
  });

  it('returns an authentication error from the installed SDK', async () => {
    const { chatSpan, provider, requests, result, spans } = await callProvider({}, { status: 401 });

    expect(requests).toHaveLength(1);
    expect(result.error).toContain('bad key');
    expect(result.error).not.toContain('local-qa-key');
    expect(result.output).toBeUndefined();
    expect(spans).toMatchObject([
      {
        name: 'chat claude-sonnet-4-6',
        instrumentationScope: { name: 'promptfoo.providers' },
        attributes: {
          'promptfoo.provider.id': provider.id(),
          'error.type': 'provider_error',
          'anthropic.request.id': 'req_local_1',
        },
        status: { code: SpanStatusCode.ERROR },
      },
    ]);
    expect(requests[0].traceparent).toBe(traceparentOf(chatSpan!.spanContext()));
  });

  it('sends trace context and records the request ID for streamed responses', async () => {
    const { chatSpan, requests, result, spans } = await callProvider({ stream: true });

    expect(requests).toMatchObject([{ body: { stream: true } }]);
    expect(result).toMatchObject({ output: 'pong', tokenUsage: { prompt: 3, completion: 1 } });
    expect(spans).toHaveLength(1);
    expect(chatSpan?.attributes).toMatchObject({
      'gen_ai.response.id': 'msg_local',
      'anthropic.message.stop_reason': 'end_turn',
      'anthropic.request.id': 'req_local_1',
    });
    expect(requests[0].traceparent).toBe(traceparentOf(chatSpan!.spanContext()));
  });

  it('sends the trace context with every request of a resumed turn', async () => {
    const { chatSpan, requests, spans } = await callProvider(
      {},
      { stopReasons: ['pause_turn', 'end_turn'] },
    );

    expect(spans).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.traceparent)).toEqual([
      traceparentOf(chatSpan!.spanContext()),
      traceparentOf(chatSpan!.spanContext()),
    ]);
    // The span identifies the request that finished the turn.
    expect(chatSpan?.attributes['anthropic.request.id']).toBe('req_local_2');
  });

  it("keeps the API's spans in the evaluation's trace", async () => {
    const { chatSpan, requests } = await callProvider();

    expect(chatSpan?.spanContext().traceId).toBe(EVAL_TRACE_ID);
    expect(chatSpan?.parentSpanContext?.spanId).toBe(TEST_CASE_SPAN_ID);
    expect(requests[0].traceparent).toBe(
      `00-${EVAL_TRACE_ID}-${chatSpan!.spanContext().spanId}-01`,
    );
  });

  it('sends no trace context for a call that promptfoo is not tracing', async () => {
    // A tracer provider left registered by an earlier traced eval must not make this call traced.
    const { requests, spans } = await callProvider({}, { callContext: null });

    expect(spans.map((span) => span.name)).toEqual(['chat claude-sonnet-4-6']);
    expect(requests[0].traceparent).toBeUndefined();
  });

  it("sends W3C trace context but never the application's baggage", async () => {
    const baggage = propagation.createBaggage({ 'user.email': { value: 'alice@example.com' } });

    const { chatSpan, requests } = await context.with(
      propagation.setBaggage(context.active(), baggage),
      () => callProvider(),
    );

    expect(requests[0].traceparent).toBe(traceparentOf(chatSpan!.spanContext()));
    expect(requests[0].baggage).toBeUndefined();
  });

  it.each([false, 'false'])('sends no trace context when openTelemetry is %j', async (option) => {
    const { requests, spans } = await callProvider({
      openTelemetry: option as AnthropicMessageOptions['openTelemetry'],
    });

    expect(spans.map((span) => span.name)).toEqual(['chat claude-sonnet-4-6']);
    expect(requests[0].traceparent).toBeUndefined();
  });

  it.each([
    ['the process environment', undefined],
    ['the provider env', { ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: 'false' }],
  ])(
    'sends no trace context when ANTHROPIC_OPEN_TELEMETRY_PROPAGATION is false in %s',
    async (_source, env) => {
      const restorePropagation = env
        ? () => {}
        : mockProcessEnv({ ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: 'false' });
      try {
        const { requests, spans } = await callProvider({}, { env });

        expect(spans.map((span) => span.name)).toEqual(['chat claude-sonnet-4-6']);
        expect(requests[0].traceparent).toBeUndefined();
      } finally {
        restorePropagation();
      }
    },
  );

  it.each([
    { traceparent: '00-11111111111111111111111111111111-2222222222222222-01' },
    { tracestate: 'vendor=configured' },
  ])('leaves trace context headers that the config sets: %j', async (configured) => {
    const { requests } = await callProvider({ headers: configured });

    expect(requests[0]).toMatchObject({
      traceparent: configured.traceparent,
      tracestate: configured.tracestate,
    });
  });

  it.each([false, true])(
    'nests the SDK spans under the promptfoo span when openTelemetry is true (stream: %s)',
    async (stream) => {
      const { chatSpan, requests, result, spans } = await callProvider({
        openTelemetry: true,
        stream,
      });

      expect(result.output).toBe('pong');
      const sdkSpan = sdkSpanOf(spans);
      expect(spans).toHaveLength(2);
      expect(sdkSpan).toMatchObject({
        instrumentationScope: { name: 'com.anthropic.sdk.typescript' },
        attributes: { 'anthropic.request.id': 'req_local_1' },
      });
      expect(sdkSpan?.parentSpanContext?.spanId).toBe(chatSpan?.spanContext().spanId);
      // The SDK sends its own span's context, so the API's spans nest under it.
      expect(requests[0].traceparent).toBe(traceparentOf(sdkSpan!.spanContext()));
    },
  );

  it('passes an openTelemetry object to the SDK as its client option', async () => {
    const { spans } = await callProvider({
      openTelemetry: { traces: { contentMode: 'content' } },
    });

    expect(sdkSpanOf(spans)?.attributes['gen_ai.input.messages']).toContain('ping');
  });

  it('reads the SDK variables for openTelemetry true through the provider env', async () => {
    const spansOff = await callProvider(
      { openTelemetry: true },
      { env: { ANTHROPIC_OPEN_TELEMETRY: 'false' } },
    );
    // With the SDK's spans off, promptfoo sends its own span's context instead.
    expect(spansOff.spans.map((span) => span.name)).toEqual(['chat claude-sonnet-4-6']);
    expect(spansOff.requests[0].traceparent).toBe(traceparentOf(spansOff.chatSpan!.spanContext()));

    exporter.reset();
    const configured = await callProvider(
      { openTelemetry: true },
      {
        env: {
          ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: 'FALSE ',
          ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE: 'content',
        },
      },
    );
    expect(sdkSpanOf(configured.spans)?.attributes['gen_ai.input.messages']).toContain('ping');
    expect(configured.requests[0].traceparent).toBeUndefined();
  });

  it.each([
    [{ traces: { contentMode: 'content' } }, false],
    [{ traces: { contentMode: 'content' }, propagation: true }, true],
  ] as const)(
    'with ANTHROPIC_OPEN_TELEMETRY_PROPAGATION=false and openTelemetry %j, sends trace context: %s',
    async (openTelemetry, sends) => {
      const { requests, spans } = await callProvider(
        { openTelemetry },
        { env: { ANTHROPIC_OPEN_TELEMETRY_PROPAGATION: 'false' } },
      );

      const sdkSpan = sdkSpanOf(spans);
      expect(sdkSpan).toBeDefined();
      expect(requests[0].traceparent).toBe(
        sends ? traceparentOf(sdkSpan!.spanContext()) : undefined,
      );
    },
  );

  it.each([
    [{ traces: false }, true],
    [{ traces: { enabled: false }, propagation: true }, true],
    [{ traces: false, propagation: false }, false],
  ] as const)(
    'with openTelemetry %j and no SDK spans, sends trace context: %s',
    async (openTelemetry, sends) => {
      const { chatSpan, requests, spans } = await callProvider({ openTelemetry });

      expect(spans.map((span) => span.name)).toEqual(['chat claude-sonnet-4-6']);
      expect(requests[0].traceparent).toBe(
        sends ? traceparentOf(chatSpan!.spanContext()) : undefined,
      );
    },
  );

  it('keeps trace context out of the response cache key', async () => {
    const { baseUrl, requests } = await createMessagesServer({});
    const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
      label: 'sdk-transport-cache-key',
      config: { apiKey: 'local-qa-key', apiBaseUrl: baseUrl },
    });
    try {
      const first = await provider.callApi('ping', tracedCall);
      const second = await provider.callApi('ping', {
        ...tracedCall,
        traceparent: '00-1af7651916cd43dd8448eb211c80319c-c7ad6b7169203331-01',
      });

      expect(first.cached).toBeFalsy();
      expect(second).toMatchObject({ output: 'pong', cached: true });
      expect(requests).toHaveLength(1);
    } finally {
      await clearCache();
    }
  });
});
