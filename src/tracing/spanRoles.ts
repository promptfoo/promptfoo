import { context, createContextKey, trace } from '@opentelemetry/api';

export const SPAN_ROLE_ATTRIBUTE = 'promptfoo.span.role';

export type PromptfooSpanRole = 'test_case' | 'target' | 'grader';

const SPAN_ROLE_CONTEXT_KEY = createContextKey('promptfoo.span.role');
const TARGET_SPANS_KEY = createContextKey('promptfoo.local.target.spans');

type TargetSpans = Map<string, { traceId: string; name: string; attributes: string[] }>;

/** The current execution's own wrappers. Sender-supplied role attributes cannot establish ownership. */
export function getLocalTargetSpans(): TargetSpans | undefined {
  return context.active().getValue(TARGET_SPANS_KEY) as TargetSpans | undefined;
}

/** Keep evaluator-owned grading activity distinct from the target's behavior. */
export function getActiveSpanRole(): PromptfooSpanRole | undefined {
  return context.active().getValue(SPAN_ROLE_CONTEXT_KEY) as PromptfooSpanRole | undefined;
}

export function withSpanRole<T>(role: PromptfooSpanRole, fn: () => T): T {
  const active = context.active().setValue(SPAN_ROLE_CONTEXT_KEY, role);
  return context.with(
    role === 'test_case' ? active.setValue(TARGET_SPANS_KEY, new Map()) : active,
    fn,
  );
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
