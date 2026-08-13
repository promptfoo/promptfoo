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

  it.each(['json', 'protobuf'] as const)(
    'redacts credentials from tool data, metadata, and error messages in %s exports',
    async (format) => {
      const exporter = new OTLPTracingExporter();
      const apiKey = 'sk-abcdefghijklmnopqrstuvwxyz';
      const sessionToken = 'agent-session-token-value-123456789012345';
      const metadataSecret = 'customer-credential-without-a-known-prefix';
      const accessToken = 'opaque.value/with+arbitrary=chars';
      const clientSecret = 'tiny';
      const refreshToken = 'renew?credential/value';
      const credentials = 'opaque-credential-bundle';
      const clientCredentials = 'oauth-client-bundle';
      const secrets = 'opaque-secret-bundle';
      const tokens = 'opaque-token-bundle';
      const authorization = 'Bearer opaque/container-value';
      const cookie = 'opaque-cookie-session';
      const callback = `https://host/callback?access_token=${accessToken}&token_count=12`;
      const colonToken = 'colon-opaque/value';
      const colonCookie = 'colon-cookie-session';
      const headerCredential = 'header-opaque.value/with+arbitrary=chars';
      const encodedCredential = 'encoded-query-opaque/value';
      const secondaryCookie = 'csrf-cookie-opaque/value';
      const equalsCredential = 'equals-header-opaque/value';
      const digestCredential = 'digest-response-opaque/value';
      const negotiateCredential = 'negotiate-opaque/value';
      const awsCredential = 'aws-signature-opaque/value';
      const encodedCallback = `https://host/callback?%61ccess_token=${encodedCredential}`;
      const logDetails =
        `access_token: ${colonToken}; Cookie: session=${colonCookie}; csrf=${secondaryCookie}; ` +
        `Authorization: Bearer ${headerCredential}; Authorization=Basic ${equalsCredential}; ` +
        `Authorization: Digest realm="accounts;production", response="${digestCredential}"; ` +
        `Authorization=Negotiate ${negotiateCredential}; ` +
        `Authorization: AWS4-HMAC-SHA256 Credential=account, SignedHeaders=host;x-amz-date, ` +
        `Signature=${awsCredential}`;
      const evaluationId = 'a'.repeat(64);
      const testCaseId = 'b'.repeat(64);
      const span = {
        type: 'trace.span',
        traceId: 'trace_0123456789abcdef0123456789abcdef',
        spanId: 'span_0123456789abcdef',
        spanData: {
          type: 'function',
          name: 'lookup_account',
          input: JSON.stringify({
            apiKey,
            accountId: 'account-123',
            access_token: accessToken,
            callback,
            encodedCallback,
            credentials,
            clientCredentials,
            authorization: [authorization],
            token_count: 12,
            token_type: 'Bearer',
            token_ids: [101, 102],
            token_endpoint: 'https://issuer.example.com/oauth/token',
            token_url: 'https://issuer.example.com/token',
            secretary: 'Alice',
            logDetails,
            nested: [{ refreshToken }],
          }),
          output: JSON.stringify({
            token: sessionToken,
            client_secret: clientSecret,
            secrets,
            tokens,
            cookie: { session: cookie },
          }),
        },
        traceMetadata: {
          customerApiKey: metadataSecret,
          clientCredentials,
          'evaluation.id': evaluationId,
          'test.case.id': testCaseId,
          'promptfoo.otlp_format': format,
        },
        error: new Error(
          `Authentication failed for ${apiKey}: ${JSON.stringify({
            client_secret: clientSecret,
            access_token: accessToken,
          })}; ${callback}; ${logDetails}`,
        ),
      };

      await exporter.export([span as any]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const serializedPayload = JSON.stringify(payload);
      expect(serializedPayload).not.toContain(apiKey);
      expect(serializedPayload).not.toContain(sessionToken);
      expect(serializedPayload).not.toContain(metadataSecret);
      expect(serializedPayload).not.toContain(accessToken);
      expect(serializedPayload).not.toContain(clientSecret);
      expect(serializedPayload).not.toContain(refreshToken);
      expect(serializedPayload).not.toContain(credentials);
      expect(serializedPayload).not.toContain(clientCredentials);
      expect(serializedPayload).not.toContain(secrets);
      expect(serializedPayload).not.toContain(tokens);
      expect(serializedPayload).not.toContain(authorization);
      expect(serializedPayload).not.toContain(cookie);
      expect(serializedPayload).not.toContain(colonToken);
      expect(serializedPayload).not.toContain(colonCookie);
      expect(serializedPayload).not.toContain(headerCredential);
      expect(serializedPayload).not.toContain(encodedCredential);
      expect(serializedPayload).not.toContain(secondaryCookie);
      expect(serializedPayload).not.toContain(equalsCredential);
      expect(serializedPayload).not.toContain(digestCredential);
      expect(serializedPayload).not.toContain(negotiateCredential);
      expect(serializedPayload).not.toContain(awsCredential);

      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      const attributes = getAttributes(exportedSpan);
      expect(JSON.parse(attributes['tool.arguments'] as string)).toEqual({
        apiKey: '<redacted>',
        accountId: 'account-123',
        access_token: '<redacted>',
        callback: 'https://host/callback?access_token=<redacted>&token_count=12',
        encodedCallback: 'https://host/callback?%61ccess_token=<redacted>',
        credentials: '<redacted>',
        clientCredentials: '<redacted>',
        authorization: '<redacted>',
        token_count: 12,
        token_type: 'Bearer',
        token_ids: [101, 102],
        token_endpoint: 'https://issuer.example.com/oauth/token',
        token_url: 'https://issuer.example.com/token',
        secretary: 'Alice',
        logDetails:
          'access_token: <redacted>; Cookie: <redacted>; Authorization: <redacted>; ' +
          'Authorization=<redacted>; Authorization: <redacted>; Authorization=<redacted>; ' +
          'Authorization: <redacted>',
        nested: [{ refreshToken: '<redacted>' }],
      });
      expect(JSON.parse(attributes['tool.output'] as string)).toEqual({
        token: '<redacted>',
        client_secret: '<redacted>',
        secrets: '<redacted>',
        tokens: '<redacted>',
        cookie: '<redacted>',
      });
      expect(attributes['trace.metadata.customerApiKey']).toBe('<redacted>');
      expect(attributes['trace.metadata.clientCredentials']).toBe('<redacted>');
      expect(attributes['evaluation.id']).toBe(evaluationId);
      expect(attributes['test.case.id']).toBe(testCaseId);
      expect(exportedSpan.status.message).toBe(
        'Authentication failed for <REDACTED_API_KEY>: ' +
          '{"client_secret":"<redacted>","access_token":"<redacted>"}; ' +
          'https://host/callback?access_token=<redacted>&token_count=12; ' +
          'access_token: <redacted>; Cookie: <redacted>; Authorization: <redacted>; ' +
          'Authorization=<redacted>; Authorization: <redacted>; Authorization=<redacted>; ' +
          'Authorization: <redacted>',
      );
    },
  );

  it.each([
    { format: 'json', includesCredential: false },
    { format: 'protobuf', includesCredential: false },
    { format: 'json', includesCredential: true },
    { format: 'protobuf', includesCredential: true },
  ] as const)(
    'preserves large integer identifiers in $format tool arguments when credential redaction is $includesCredential',
    async ({ format, includesCredential }) => {
      const exporter = new OTLPTracingExporter();
      const input = includesCredential
        ? '{"access_token":"tiny","order_id":9223372036854775807}'
        : '{"order_id":9223372036854775807,"token_count":12}';
      await exporter.export([
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcdef',
          spanData: { type: 'function', name: 'lookup_order', input },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        } as any,
      ]);

      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const exportedSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];
      expect(getAttributes(exportedSpan)['tool.arguments']).toBe(
        includesCredential ? '{"access_token":"<redacted>","order_id":9223372036854775807}' : input,
      );
    },
  );

  it.each([
    { format: 'json', shape: 'deeply nested' },
    { format: 'protobuf', shape: 'deeply nested' },
    { format: 'json', shape: 'oversized' },
    { format: 'protobuf', shape: 'oversized' },
  ] as const)(
    'keeps $format span batches exportable when tool data is $shape',
    async ({ format, shape }) => {
      const exporter = new OTLPTracingExporter();
      const deeplyNestedSecret = 'deeply-nested-credential';
      const oversizedInput = `[${'0,'.repeat(50_000)}${JSON.stringify({
        access_token: deeplyNestedSecret,
      })}]`;
      const unsafeInput =
        shape === 'oversized'
          ? oversizedInput
          : '['.repeat(5000) +
            JSON.stringify({ access_token: deeplyNestedSecret }) +
            ']'.repeat(5000);
      const spans = [
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde0',
          spanData: { type: 'function', name: 'nested_tool', input: unsafeInput },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        },
        {
          type: 'trace.span',
          traceId: 'trace_0123456789abcdef0123456789abcdef',
          spanId: 'span_0123456789abcde1',
          spanData: { type: 'function', name: 'healthy_tool', input: '{"accountId":"123"}' },
          traceMetadata: { 'promptfoo.otlp_format': format },
          error: null,
        },
      ];

      const parseSpy = shape === 'oversized' ? vi.spyOn(JSON, 'parse') : undefined;
      try {
        await exporter.export(spans as any);
        if (parseSpy) {
          expect(parseSpy).not.toHaveBeenCalledWith(unsafeInput);
        }
      } finally {
        parseSpy?.mockRestore();
      }

      expect(mockFetchWithProxy).toHaveBeenCalledOnce();
      const body = mockFetchWithProxy.mock.calls[0][1].body as string | Uint8Array;
      const payload =
        format === 'protobuf'
          ? await decodeExportTraceServiceRequest(body as Uint8Array)
          : JSON.parse(body as string);
      const exportedSpans = payload.resourceSpans[0].scopeSpans[0].spans;
      expect(exportedSpans).toHaveLength(2);
      expect(JSON.stringify(exportedSpans)).not.toContain(deeplyNestedSecret);
      expect(getAttributes(exportedSpans[0])['tool.arguments']).toContain('<redacted>');
      expect(getAttributes(exportedSpans[1])['tool.arguments']).toBe('{"accountId":"123"}');
    },
  );

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
