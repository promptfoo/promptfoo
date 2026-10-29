import { filterTraceSpans, finishTraceAssertion } from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';
import type { TraceSpanAttributeFilter } from './traceUtils';

interface TraceSpanCountValue {
  pattern: string;
  min?: number;
  max?: number;
  attributes?: TraceSpanAttributeFilter;
}

export const handleTraceSpanCount = (params: AssertionParams): GradingResult => {
  const { assertion, assertionValueContext, renderedValue } = params;
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-span-count assertion');
  }

  const value = (renderedValue ?? assertion.value) as TraceSpanCountValue;
  if (!value || typeof value !== 'object' || !value.pattern) {
    throw new Error('trace-span-count assertion must have a value object with pattern property');
  }

  const { pattern, min, max, attributes } = value;
  const spans = assertionValueContext.trace.spans as TraceSpan[];

  // Count spans matching the pattern
  const matchingSpans = filterTraceSpans(spans, pattern, attributes);
  const count = matchingSpans.length;

  // Check against constraints
  let pass = true;
  let reason = '';

  if (min !== undefined && count < min) {
    pass = false;
    reason = `Found ${count} spans matching pattern "${pattern}", expected at least ${min}`;
  } else if (max !== undefined && count > max) {
    pass = false;
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

  return finishTraceAssertion(params, pass, reason, attributes);
};
