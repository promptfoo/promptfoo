import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptfooAttributes } from '../../src/tracing/genaiTracer';
import {
  GraderAttributes,
  getServiceName,
  isGradingContext,
  withGraderSpan,
} from '../../src/tracing/graderTracer';

const mocks = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  };

  return {
    contextActive: vi.fn(() => ({ traceId: 'active' })),
    contextWith: vi.fn((_context, fn: () => unknown) => fn()),
    propagationExtract: vi.fn(() => ({ traceId: 'parent' })),
    span,
    traceSetSpan: vi.fn((parentContext, activeSpan) => ({
      activeSpan,
      parentContext,
    })),
    tracer: {
      startSpan: vi.fn(() => span),
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
      with: mocks.contextWith,
    },
    propagation: {
      ...actual.propagation,
      extract: mocks.propagationExtract,
    },
    ROOT_CONTEXT: { traceId: 'root' },
    SpanKind: {
      INTERNAL: 0,
    },
    SpanStatusCode: {
      OK: 1,
      ERROR: 2,
    },
    trace: {
      ...actual.trace,
      getTracer: vi.fn(() => mocks.tracer),
      setSpan: mocks.traceSetSpan,
    },
  };
});

describe('graderTracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects grading labels and service names', () => {
    expect(isGradingContext()).toBe(false);
    expect(isGradingContext('judge:toxicity')).toBe(true);
    expect(getServiceName('llm-rubric')).toBe('llm-rubric');
    expect(getServiceName('customer-support')).toBe('promptfoo-cli');
  });

  it('creates a grader span with trace linkage and result attributes', async () => {
    const result = await withGraderSpan(
      {
        graderId: 'promptfoo:redteam:rbac',
        promptLabel: 'llm-rubric',
        evalId: 'eval-1',
        testIndex: 2,
        iteration: 3,
        traceparent: '00-trace-id-span-id-01',
      },
      async () => ({ pass: true, score: 1 }),
      (value) => value,
    );

    expect(result).toEqual({ pass: true, score: 1 });
    expect(mocks.propagationExtract).toHaveBeenCalledWith(
      { traceId: 'root' },
      { traceparent: '00-trace-id-span-id-01' },
    );
    expect(mocks.tracer.startSpan).toHaveBeenCalledWith(
      'grader promptfoo:redteam:rbac',
      {
        kind: SpanKind.INTERNAL,
        attributes: expect.objectContaining({
          [GraderAttributes.SERVICE_NAME]: 'promptfoo-api',
          [GraderAttributes.GRADER_ID]: 'promptfoo:redteam:rbac',
          [PromptfooAttributes.PROMPT_LABEL]: 'llm-rubric',
          [PromptfooAttributes.EVAL_ID]: 'eval-1',
          [PromptfooAttributes.TEST_INDEX]: 2,
          [PromptfooAttributes.ITERATION]: 3,
        }),
      },
      { traceId: 'parent' },
    );
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(GraderAttributes.GRADER_PASS, true);
    expect(mocks.span.setAttribute).toHaveBeenCalledWith(GraderAttributes.GRADER_SCORE, 1);
    expect(mocks.span.end).toHaveBeenCalled();
  });

  it('ignores result extractor failures after a successful grading call', async () => {
    await expect(
      withGraderSpan(
        { graderId: 'promptfoo:redteam:rbac' },
        async () => ({ pass: true }),
        () => {
          throw new Error('extractor failed');
        },
      ),
    ).resolves.toEqual({ pass: true });
    expect(mocks.span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });

  it('marks thrown grading failures as span errors', async () => {
    const error = new Error('grading failed');

    await expect(
      withGraderSpan({ graderId: 'promptfoo:redteam:rbac' }, async () => {
        throw error;
      }),
    ).rejects.toThrow('grading failed');

    expect(mocks.span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'grading failed',
    });
    expect(mocks.span.recordException).toHaveBeenCalledWith(error);
    expect(mocks.span.end).toHaveBeenCalled();
  });
});
