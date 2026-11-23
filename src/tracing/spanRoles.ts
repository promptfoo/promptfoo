import { context, createContextKey, type Span, trace } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';

export const SPAN_ROLE_ATTRIBUTE = 'promptfoo.span.role';

export type PromptfooSpanRole = 'test_case' | 'target' | 'grader';

const SPAN_ROLE_CONTEXT_KEY = createContextKey('promptfoo.span.role');
const EVALUATOR_SPANS_KEY = createContextKey('promptfoo.local.evaluator.spans');

interface EvaluatorSpan {
  traceId: string;
  role: 'target' | 'grader';
  name: string;
  attributes: string[];
  provider?: { attributes: ReadableSpan['attributes']; statusCode?: number };
}

type EvaluatorSpans = Map<string, EvaluatorSpan>;

/** Sender-supplied role attributes cannot establish evaluator ownership. */
export function getLocalEvaluatorSpans(): EvaluatorSpans | undefined {
  return context.active().getValue(EVALUATOR_SPANS_KEY) as EvaluatorSpans | undefined;
}

export function recordEvaluatorSpan(
  span: Span,
  role: 'target' | 'grader',
  name: string,
  attributes: string[],
  provider?: EvaluatorSpan['provider'],
): void {
  const spans = getLocalEvaluatorSpans();
  if (spans && span.isRecording()) {
    const { traceId, spanId } = span.spanContext();
    spans.set(spanId, {
      traceId,
      role,
      name,
      attributes: [...attributes, 'service.name', 'service.version'],
      provider,
    });
  }
}

/** Only register provider children created locally in the evaluator's grading context. */
export function recordGraderChildSpan(span: Span): void {
  if (getActiveSpanRole() !== 'grader') {
    return;
  }
  const { attributes, name, status } = span as Span & Partial<ReadableSpan>;
  if (name && attributes?.[SPAN_ROLE_ATTRIBUTE] === 'grader') {
    // Native spans can contain commands. A changed command under the same
    // span ID and attribute names must remain evidence.
    recordEvaluatorSpan(span, 'grader', name, Object.keys(attributes), {
      attributes,
      statusCode: status?.code,
    });
  }
}

/** Keep evaluator-owned grading activity distinct from the target's behavior. */
export function getActiveSpanRole(): PromptfooSpanRole | undefined {
  return context.active().getValue(SPAN_ROLE_CONTEXT_KEY) as PromptfooSpanRole | undefined;
}

export function withSpanRole<T>(role: PromptfooSpanRole, fn: () => T): T {
  const active = context.active().setValue(SPAN_ROLE_CONTEXT_KEY, role);
  return context.with(
    role === 'test_case' ? active.setValue(EVALUATOR_SPANS_KEY, new Map()) : active,
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
