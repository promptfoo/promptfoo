import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { type PromptfooSpanRole, SPAN_ROLE_ATTRIBUTE } from './spanRoles';
import type { Span } from '@opentelemetry/api';

import type { ParsedTrace } from './store';

// A collector may return wrappers long after export, including when the host owns
// the exporter. Bind each role to one wrapper without retaining completed spans.
const key = randomBytes(32);
export const SPAN_ORIGIN_ATTRIBUTE = 'promptfoo.span.origin';

function origin(
  traceId: string,
  spanId: string,
  parentId: string | undefined,
  name: string,
  role: string,
) {
  return createHmac('sha256', key)
    .update(JSON.stringify([traceId, spanId, parentId || '', name, role]))
    .digest();
}

export function markEvaluatorSpan(
  span: Span,
  role: PromptfooSpanRole,
  name: string,
  parentId?: string,
): void {
  const { traceId, spanId } = span.spanContext();
  span.setAttribute(
    SPAN_ORIGIN_ATTRIBUTE,
    origin(traceId, spanId, parentId, name, role).toString('hex'),
  );
}

// Verify the original wire tuple. Only remove fields from the destination so
// a redaction policy can still scrub echoes and withhold the role itself.
export function setReceivedSpanOwnership(
  { traceId, span }: ParsedTrace,
  attributes = span.attributes,
): void {
  if (!attributes) {
    return;
  }
  const role = span.attributes?.[SPAN_ROLE_ATTRIBUTE];
  const received = span.attributes?.[SPAN_ORIGIN_ATTRIBUTE];
  delete attributes[SPAN_ORIGIN_ATTRIBUTE];
  if (
    typeof role !== 'string' ||
    typeof received !== 'string' ||
    !/^[a-f0-9]{64}$/.test(received) ||
    !timingSafeEqual(
      Buffer.from(received, 'hex'),
      origin(traceId, span.spanId, span.parentSpanId, span.name, role),
    )
  ) {
    delete attributes[SPAN_ROLE_ATTRIBUTE];
  }
}
