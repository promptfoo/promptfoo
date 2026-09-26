import {
  context,
  createContextKey,
  defaultTextMapGetter,
  ROOT_CONTEXT,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

export const SPAN_ROLE_ATTRIBUTE = 'promptfoo.span.role';

export type PromptfooSpanRole = 'test_case' | 'target' | 'grader';

const SPAN_ROLE_CONTEXT_KEY = createContextKey('promptfoo.span.role');
const traceContextPropagator = new W3CTraceContextPropagator();

/** Explicit traceparent values use W3C format independently of the host's propagator. */
export function extractTraceparentContext(traceparent: string) {
  return traceContextPropagator.extract(ROOT_CONTEXT, { traceparent }, defaultTextMapGetter);
}

/** Keep evaluator-owned grading activity distinct from the target's behavior. */
export function getActiveSpanRole(): PromptfooSpanRole | undefined {
  return context.active().getValue(SPAN_ROLE_CONTEXT_KEY) as PromptfooSpanRole | undefined;
}

export function withSpanRole<T>(role: PromptfooSpanRole, fn: () => T): T {
  return context.with(context.active().setValue(SPAN_ROLE_CONTEXT_KEY, role), fn);
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
