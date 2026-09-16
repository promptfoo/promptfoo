import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptfooAttributes } from '../../src/tracing/genaiTracer';
import { TargetAttributes, withTargetSpan } from '../../src/tracing/targetTracer';

const mocks = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  };

  return {
    propagationExtract: vi.fn(() => ({ traceId: 'parent' })),
    span,
    tracer: {
      startActiveSpan: vi.fn((_name, _options, _context, fn) => fn(span)),
    },
  };
});

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');

  return {
    ...actual,
    propagation: {
      ...actual.propagation,
      extract: mocks.propagationExtract,
    },
    ROOT_CONTEXT: { traceId: 'root' },
    trace: {
      ...actual.trace,
      getTracer: vi.fn(() => mocks.tracer),
    },
  };
});

describe('universal target tracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records target context and cached responses for custom providers', async () => {
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const result = await withTargetSpan(
      {
        targetType: 'provider',
        providerId: 'python:customer_provider.py',
        label: 'Customer provider',
        traceparent,
        promptLabel: 'test prompt',
        evalId: 'eval-1',
        testIndex: 3,
      },
      async () => ({ cached: true, output: 'ok' }),
    );

    expect(result).toEqual({ cached: true, output: 'ok' });
    expect(mocks.propagationExtract).toHaveBeenCalledWith({ traceId: 'root' }, { traceparent });
    expect(mocks.tracer.startActiveSpan).toHaveBeenCalledWith(
      'Customer provider',
      {
        kind: SpanKind.CLIENT,
        attributes: expect.objectContaining({
          [TargetAttributes.TARGET_TYPE]: 'provider',
          [TargetAttributes.TARGET_LABEL]: 'Customer provider',
          [PromptfooAttributes.PROVIDER_ID]: 'python:customer_provider.py',
          [PromptfooAttributes.PROMPT_LABEL]: 'test prompt',
          [PromptfooAttributes.EVAL_ID]: 'eval-1',
          [PromptfooAttributes.TEST_INDEX]: 3,
        }),
      },
      { traceId: 'parent' },
      expect.any(Function),
    );
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(PromptfooAttributes.CACHE_HIT, true);
    expect(mocks.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mocks.span.end).toHaveBeenCalledOnce();
  });

  it('records provider error responses without swallowing the result', async () => {
    const result = await withTargetSpan(
      {
        targetType: 'provider',
        providerId: 'a2a:customer-agent',
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      },
      async () => ({ error: 'agent unavailable' }),
    );

    expect(result).toEqual({ error: 'agent unavailable' });
    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'agent unavailable',
    });
    expect(mocks.span.recordException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('keeps grader-provider spans free of target-only metadata', async () => {
    await withTargetSpan(
      {
        targetType: 'provider',
        providerId: 'openai:judge',
        label: 'Judge provider',
        role: 'grader',
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      },
      async () => ({ output: 'pass' }),
    );

    const [name, options] = mocks.tracer.startActiveSpan.mock.calls[0];
    expect(name).toBe('grader provider Judge provider');
    expect(options.attributes).toMatchObject({
      [PromptfooAttributes.PROVIDER_ID]: 'openai:judge',
      'promptfoo.span.role': 'grader',
    });
    expect(options.attributes).not.toHaveProperty(TargetAttributes.TARGET_TYPE);
    expect(options.attributes).not.toHaveProperty(TargetAttributes.TARGET_LABEL);
    expect(options.attributes).not.toHaveProperty('service.name');
  });

  it('records and rethrows provider exceptions', async () => {
    const error = new Error('target unavailable');

    await expect(
      withTargetSpan(
        {
          targetType: 'http',
          providerId: 'http:customer-api',
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        },
        async () => {
          throw error;
        },
      ),
    ).rejects.toThrow('target unavailable');

    expect(mocks.span.recordException).toHaveBeenCalledWith(error);
    expect(mocks.span.end).toHaveBeenCalledOnce();
  });
});
