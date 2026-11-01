import { type Attributes, context, createContextKey, type Span, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';

export const PROMPTFOO_TRACER_NAME = 'promptfoo.providers';
export const SPAN_ROLE_ATTRIBUTE = 'promptfoo.span.role';
export const TEST_CASE_SPAN_NAME = 'promptfoo.test_case';
export const TEST_CASE_OUTCOME_ATTRIBUTES = {
  success: 'promptfoo.test.success',
  score: 'promptfoo.test.score',
} as const;

export type PromptfooSpanRole = 'test_case' | 'target' | 'grader';

const SPAN_ROLE_CONTEXT_KEY = createContextKey('promptfoo.span.role');
const TEST_CASE_ROOT_KEY = createContextKey('promptfoo.test_case.root');

/** Keep evaluator-owned grading activity distinct from the target's behavior. */
export function getActiveSpanRole(): PromptfooSpanRole | undefined {
  return context.active().getValue(SPAN_ROLE_CONTEXT_KEY) as PromptfooSpanRole | undefined;
}

export function withSpanRole<T>(role: PromptfooSpanRole, fn: () => T): T {
  let next = context.active().setValue(SPAN_ROLE_CONTEXT_KEY, role);
  if (role === 'test_case') {
    next = next.setValue(TEST_CASE_ROOT_KEY, trace.getSpan(next));
  }
  return context.with(next, fn);
}

/** Compare a still-open root during live grading without copying resource values into trace metadata. */
export function getLiveTestCaseAttributes(traceId: string, spanId: string): Attributes | undefined {
  const root = context.active().getValue(TEST_CASE_ROOT_KEY) as
    | (Span & Partial<ReadableSpan>)
    | undefined;
  const id = root?.spanContext();
  if (
    !root?.isRecording() ||
    id?.traceId !== traceId ||
    id.spanId !== spanId ||
    root.attributes?.[SPAN_ROLE_ATTRIBUTE] !== 'test_case' ||
    !root.resource ||
    root.resource.asyncAttributesPending
  ) {
    return undefined;
  }
  return { ...root.resource.attributes, ...root.attributes };
}

/** Return a usable traceparent only when the active span has a valid recorded context. */
export function getActiveTraceparent(): string | undefined {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return undefined;
  }

  const spanContext = activeSpan.spanContext();
  if (!trace.isSpanContextValid(spanContext)) {
    return undefined;
  }

  const traceFlags = spanContext.traceFlags.toString(16).padStart(2, '0');
  return `00-${spanContext.traceId}-${spanContext.spanId}-${traceFlags}`;
}
