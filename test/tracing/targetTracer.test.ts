import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptfooAttributes } from '../../src/tracing/genaiTracer';
import { HttpAttributes } from '../../src/tracing/oauthTracer';
import {
  MCPAttributes,
  TargetAttributes,
  withHttpRequestSpan,
  withMCPToolCallSpan,
  withTargetSpan,
} from '../../src/tracing/targetTracer';

const mocks = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  };

  return {
    contextActive: vi.fn(() => ({ traceId: 'active' })),
    propagationExtract: vi.fn(() => ({ traceId: 'parent' })),
    span,
    tracer: {
      startActiveSpan: vi.fn((_name, _options, arg3, arg4) => {
        const fn = typeof arg4 === 'function' ? arg4 : arg3;
        return fn(span);
      }),
    },
  };
});

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');

  return {
    ...actual,
    context: {
      ...actual.context,
      active: mocks.contextActive,
    },
    propagation: {
      ...actual.propagation,
      extract: mocks.propagationExtract,
    },
    ROOT_CONTEXT: { traceId: 'root' },
    SpanKind: {
      CLIENT: 2,
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
    trace: {
      ...actual.trace,
      getTracer: vi.fn(() => mocks.tracer),
    },
  };
});

describe('targetTracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates target spans with trace linkage, context attributes, and cache state', async () => {
    const result = await withTargetSpan(
      {
        targetType: 'http',
        url: 'https://api.example.com/chat',
        providerId: 'http:chat',
        label: 'Chat API',
        traceparent: '00-trace-id-span-id-01',
        promptLabel: 'llm-rubric',
        evalId: 'eval-1',
        testIndex: 4,
        iteration: 2,
      },
      async () => ({ cached: true, output: 'ok' }),
    );

    expect(result).toEqual({ cached: true, output: 'ok' });
    expect(mocks.propagationExtract).toHaveBeenCalledWith(
      { traceId: 'root' },
      { traceparent: '00-trace-id-span-id-01' },
    );
    expect(mocks.tracer.startActiveSpan).toHaveBeenCalledWith(
      'Chat API',
      {
        kind: SpanKind.CLIENT,
        attributes: expect.objectContaining({
          [TargetAttributes.SERVICE_NAME]: 'llm-rubric',
          [TargetAttributes.TARGET_TYPE]: 'http',
          [TargetAttributes.TARGET_URL]: 'https://api.example.com/chat',
          [TargetAttributes.TARGET_LABEL]: 'Chat API',
          [PromptfooAttributes.PROVIDER_ID]: 'http:chat',
          [PromptfooAttributes.PROMPT_LABEL]: 'llm-rubric',
          [PromptfooAttributes.EVAL_ID]: 'eval-1',
          [PromptfooAttributes.TEST_INDEX]: 4,
          [PromptfooAttributes.ITERATION]: 2,
        }),
      },
      { traceId: 'parent' },
      expect.any(Function),
    );
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(PromptfooAttributes.CACHE_HIT, true);
    expect(mocks.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('marks target responses with provider errors as span failures', async () => {
    await withTargetSpan({ targetType: 'mcp', providerId: 'mcp' }, async () => ({
      error: 'tool failed',
    }));

    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'tool failed',
    });
    expect(mocks.span.recordException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('records thrown target span exceptions', async () => {
    const error = new Error('target failed');

    await expect(
      withTargetSpan({ targetType: 'http', providerId: 'http:test' }, async () => {
        throw error;
      }),
    ).rejects.toThrow('target failed');

    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'target failed',
    });
    expect(mocks.span.recordException).toHaveBeenCalledWith(error);
  });

  it('marks MCP tool call spans from result extractors', async () => {
    await withMCPToolCallSpan(
      { toolName: 'lookup', serverKey: 'server-1' },
      async () => ({ error: true }),
      (value) => value,
    );

    expect(mocks.tracer.startActiveSpan).toHaveBeenCalledWith(
      'mcp tool_call lookup',
      {
        kind: SpanKind.CLIENT,
        attributes: expect.objectContaining({
          [TargetAttributes.SERVICE_NAME]: 'promptfoo-cli',
          [MCPAttributes.TOOL_NAME]: 'lookup',
          [MCPAttributes.SERVER_KEY]: 'server-1',
        }),
      },
      expect.any(Function),
    );
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'Tool call returned an error',
    });
  });

  it('captures HTTP request metadata when URL parsing fails', async () => {
    await withHttpRequestSpan(
      { method: 'POST', url: 'not a valid URL' },
      async () => ({ status: 201 }),
      () => ({ httpStatusCode: 201 }),
    );

    expect(mocks.tracer.startActiveSpan).toHaveBeenCalledWith(
      'POST',
      {
        kind: SpanKind.CLIENT,
        attributes: expect.objectContaining({
          [TargetAttributes.SERVICE_NAME]: 'promptfoo-cli',
          [HttpAttributes.REQUEST_METHOD]: 'POST',
          [HttpAttributes.URL_FULL]: 'not a valid URL',
        }),
      },
      expect.any(Function),
    );
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(HttpAttributes.RESPONSE_STATUS_CODE, 201);
    expect(mocks.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });
});
