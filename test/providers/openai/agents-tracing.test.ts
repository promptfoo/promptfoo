import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OTLPTracingExporter } from '../../../src/providers/openai/agents-tracing';
import { decodeExportTraceServiceRequest } from '../../../src/tracing/protobuf';

const mockFetchWithProxy = vi.hoisted(() => vi.fn());

vi.mock('../../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

function getAttributes(span: any): Record<string, unknown> {
  return Object.fromEntries(
    span.attributes.map((attribute: any) => {
      const value = attribute.value;
      if (value.stringValue !== undefined) {
        return [attribute.key, value.stringValue];
      }
      if (value.intValue !== undefined) {
        return [attribute.key, Number(value.intValue)];
      }
      if (value.boolValue !== undefined) {
        return [attribute.key, value.boolValue];
      }
      if (value.doubleValue !== undefined) {
        return [attribute.key, value.doubleValue];
      }
      return [attribute.key, value];
    }),
  );
}

describe('OTLPTracingExporter', () => {
  beforeEach(() => {
    mockFetchWithProxy.mockReset();
    mockFetchWithProxy.mockResolvedValue({ ok: true });
  });

  it('keeps provider token counts standard and namespaces Promptfoo totals', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'generation',
          model: 'gpt-4.1',
          usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('chat gpt-4.1');
    expect(span.kind).toBe(3); // OTLP SpanKind.CLIENT
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'gen_ai.request.model': 'gpt-4.1',
      'gen_ai.usage.input_tokens': 12,
      'gen_ai.usage.output_tokens': 8,
      'promptfoo.usage.total_tokens': 20,
    });
    expect(getAttributes(span)).not.toHaveProperty('gen_ai.usage.total_tokens');
  });

  it('maps Responses API spans into model inference spans without creating duplicates', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'response',
          response_id: 'resp_123',
          _response: {
            id: 'resp_123',
            model: 'gpt-4.1',
            usage: {
              input_tokens: 120,
              output_tokens: 35,
              total_tokens: 155,
              input_tokens_details: { cached_tokens: 40 },
              output_tokens_details: { reasoning_tokens: 12 },
            },
          },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const spans = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('chat gpt-4.1');
    expect(spans[0].kind).toBe(3); // OTLP SpanKind.CLIENT
    expect(getAttributes(spans[0])).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'gen_ai.response.model': 'gpt-4.1',
      'gen_ai.response.id': 'resp_123',
      'gen_ai.usage.input_tokens': 120,
      'gen_ai.usage.output_tokens': 35,
      'gen_ai.usage.cache_read.input_tokens': 40,
      'gen_ai.usage.reasoning.output_tokens': 12,
      'openai.api.type': 'responses',
      'openai.agents.span_type': 'response',
      'openai.response_id': 'resp_123',
      'promptfoo.usage.total_tokens': 155,
    });
    expect(getAttributes(spans[0])).not.toHaveProperty('gen_ai.request.model');
  });

  it('keeps requested model aliases distinct from returned deployment identifiers', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: {
          type: 'response',
          response_id: 'resp_123',
          _response: { id: 'resp_123', model: 'gpt-4.1-2025-04-14' },
        },
        traceMetadata: { 'promptfoo.request_model': 'support-agent-alias' },
        error: null,
      },
    ]);

    const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
    expect(attributes).toMatchObject({
      'gen_ai.request.model': 'support-agent-alias',
      'gen_ai.response.model': 'gpt-4.1-2025-04-14',
    });
    expect(attributes).not.toHaveProperty('trace.metadata.promptfoo.request_model');
  });

  it.each([
    {
      description: 'explicit custom provider metadata',
      model: 'production-deployment',
      modelConfig: { provider: 'azure' },
      metadata: {},
      expectedProvider: 'azure',
    },
    {
      description: 'provider-prefixed custom models',
      model: 'anthropic/claude-sonnet-4-5',
      modelConfig: undefined,
      metadata: {},
      expectedProvider: 'anthropic',
    },
    {
      description: 'provider metadata propagated from a custom model object',
      model: 'custom-deployment',
      modelConfig: undefined,
      metadata: { 'promptfoo.model_provider': 'litellm' },
      expectedProvider: 'litellm',
    },
  ])(
    'preserves $description on generation spans',
    ({ model, modelConfig, metadata, expectedProvider }) => {
      const exporter = new OTLPTracingExporter() as any;
      const payload = exporter.transformToOTLP([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: { type: 'generation', model, model_config: modelConfig },
          traceMetadata: metadata,
          error: null,
        },
      ]);

      const attributes = getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0]);
      expect(attributes['gen_ai.provider.name']).toBe(expectedProvider);
      expect(attributes).not.toHaveProperty('trace.metadata.promptfoo.model_provider');
    },
  );

  it('omits provider attribution when a custom model backend cannot be identified', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: { type: 'generation', model: 'private-customer-deployment' },
        traceMetadata: {},
        error: null,
      },
    ]);

    expect(getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0])).not.toHaveProperty(
      'gen_ai.provider.name',
    );
  });

  it('exports protobuf to protobuf-only receivers', async () => {
    const exporter = new OTLPTracingExporter();
    const span = {
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: 'span_0123456789abcdef',
      spanData: { type: 'generation', model: 'gpt-4.1' },
      traceMetadata: {
        'promptfoo.otlp_endpoint': 'http://127.0.0.1:14318',
        'promptfoo.otlp_format': 'protobuf',
      },
      error: null,
    };

    await exporter.export([span as any]);

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      'http://127.0.0.1:14318/v1/traces',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-protobuf' },
        body: expect.any(Uint8Array),
      }),
    );
    const request = mockFetchWithProxy.mock.calls[0][1];
    const decoded = await decodeExportTraceServiceRequest(request.body);
    expect(decoded.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('chat gpt-4.1');
  });

  it('keeps explicitly configured and default destinations on JSON', async () => {
    const exporter = new OTLPTracingExporter();
    const span = {
      type: 'trace.span',
      traceId: 'trace_0123456789abcdef0123456789abcdef',
      spanId: 'span_0123456789abcdef',
      spanData: { type: 'generation', model: 'gpt-4.1' },
      traceMetadata: { 'promptfoo.otlp_endpoint': 'https://collector.example.com:4318' },
      error: null,
    };

    await exporter.export([span as any]);

    expect(mockFetchWithProxy).toHaveBeenCalledWith(
      'https://collector.example.com:4318/v1/traces',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      }),
    );
  });

  it('keeps Responses API spans useful when the SDK exposes only a response identifier', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_partial' },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('chat unknown-model');
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'chat',
      'gen_ai.provider.name': 'openai',
      'openai.api.type': 'responses',
      'gen_ai.response.id': 'resp_partial',
    });
    expect(getAttributes(span)).not.toHaveProperty('gen_ai.request.model');
  });

  it('maps agent runs into standard agent invocation spans', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'agent', name: 'Support Agent', tools: ['lookup_order'] },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('invoke_agent Support Agent');
    expect(span.kind).toBe(1); // OTLP SpanKind.INTERNAL
    expect(getAttributes(span)).toMatchObject({
      'gen_ai.operation.name': 'invoke_agent',
      'gen_ai.agent.name': 'Support Agent',
      'agent.name': 'Support Agent',
    });
  });

  it('uses Promptfoo service resources without exposing internal routing metadata', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_123' },
        traceMetadata: { 'promptfoo.service_name': 'custom-promptfoo-service' },
        error: null,
      },
      {
        type: 'trace.span',
        traceId: 'trace_abcdef0123456789abcdef0123456789',
        spanId: 'span_abcdef0123456789',
        parentId: null,
        spanData: { type: 'response', response_id: 'resp_456' },
        traceMetadata: {},
        error: null,
      },
    ]);

    expect(payload.resourceSpans).toHaveLength(2);
    expect(payload.resourceSpans[0].resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'custom-promptfoo-service' } },
    ]);
    expect(payload.resourceSpans[1].resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'promptfoo' } },
    ]);
    expect(getAttributes(payload.resourceSpans[0].scopeSpans[0].spans[0])).not.toHaveProperty(
      'trace.metadata.promptfoo.service_name',
    );
  });

  it('maps function spans into Promptfoo trajectory-friendly tool attributes', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'function',
          name: 'lookup_order',
          input: '{"order_id":"123"}',
          output: '{"status":"shipped"}',
        },
        traceMetadata: {
          'evaluation.id': 'eval-1',
          'test.case.id': 'case-1',
          'promptfoo.parent_span_id': 'fedcba9876543210',
        },
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('execute_tool lookup_order');
    expect(getAttributes(span)).toMatchObject({
      'evaluation.id': 'eval-1',
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'lookup_order',
      'openai.agents.span_type': 'function',
      'test.case.id': 'case-1',
      'tool.arguments': '{"order_id":"123"}',
      'tool.name': 'lookup_order',
      'tool.output': '{"status":"shipped"}',
    });
    expect(span.parentSpanId).toBe(Buffer.from('fedcba9876543210', 'hex').toString('base64'));
  });

  it('turns sandbox custom spans into command-aware spans', () => {
    const exporter = new OTLPTracingExporter() as any;
    const payload = exporter.transformToOTLP([
      {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        parentId: null,
        startedAt: '2026-05-06T12:00:00.000Z',
        endedAt: '2026-05-06T12:00:01.000Z',
        spanData: {
          type: 'custom',
          name: 'sandbox.exec',
          data: {
            cmd: ['cat', 'repo/task.md'],
            workdir: 'repo',
          },
        },
        traceMetadata: {},
        error: null,
      },
    ]);

    const span = payload.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.name).toBe('sandbox.exec');
    expect(getAttributes(span)).toMatchObject({
      command: 'cat repo/task.md',
      cmd: {
        arrayValue: {
          values: [{ stringValue: 'cat' }, { stringValue: 'repo/task.md' }],
        },
      },
      'openai.agents.custom_span.name': 'sandbox.exec',
      'openai.agents.span_type': 'custom',
      workdir: 'repo',
    });
  });
});
