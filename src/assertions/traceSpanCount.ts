import { traceSpanCountBoundsError } from './traceAssertionConfig';
import { matchesPattern } from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';

interface TraceSpanCountValue {
  pattern: string;
  min?: number;
  max?: number;
}

export const handleTraceSpanCount = ({
  assertion,
  assertionValueContext,
  inverse,
}: AssertionParams): GradingResult => {
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-span-count assertion');
  }

  const value = assertion.value as TraceSpanCountValue;
  if (!value || typeof value !== 'object' || typeof value.pattern !== 'string' || !value.pattern) {
    throw new Error('trace-span-count assertion must have a value object with pattern property');
  }

  const { pattern, min, max } = value;
  const boundsError = traceSpanCountBoundsError(value);
  if (boundsError) {
    throw new Error(boundsError);
  }
  const spans = assertionValueContext.trace.spans as TraceSpan[];

  // Count spans matching the pattern
  const matchingSpans = spans.filter((span) => matchesPattern(span.name, pattern));
  const count = matchingSpans.length;

  // Check against constraints
  let basePass = true;
  let reason = '';

  if (min !== undefined && count < min) {
    basePass = false;
    reason = `Found ${count} spans matching pattern "${pattern}", expected at least ${min}`;
  } else if (max !== undefined && count > max) {
    basePass = false;
    reason = `Found ${count} spans matching pattern "${pattern}", expected at most ${max}`;
  } else {
    reason = `Found ${count} spans matching pattern "${pattern}"`;
    if (min !== undefined && max !== undefined) {
      reason += ` (expected ${min}-${max})`;
    } else if (min !== undefined) {
      reason += ` (expected at least ${min})`;
    } else if (max !== undefined) {
      reason += ` (expected at most ${max})`;
    }
  }

  // Add matched span names for debugging
  if (matchingSpans.length > 0) {
    const spanNames = [...new Set(matchingSpans.map((s) => s.name))];
    reason += `. Matched spans: ${spanNames.join(', ')}`;
  }

  const pass = inverse ? !basePass : basePass;
  if (inverse) {
    reason = basePass
      ? `not-trace-span-count: forbidden count ${count} satisfied the range for pattern "${pattern}"`
      : `not-trace-span-count: count ${count} did not satisfy the forbidden range for pattern "${pattern}"`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
