import type { AssertionParams, GradingResult } from '../types';
import type { TraceSpan } from '../types/tracing';

interface TraceErrorSpansValue {
  max_count?: number;
  max_percentage?: number;
  pattern?: string;
}

function matchesPattern(spanName: string, pattern: string): boolean {
  // Convert glob-like pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*/g, '.*') // Convert * to .*
    .replace(/\?/g, '.'); // Convert ? to .

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(spanName);
}

function isErrorSpan(span: TraceSpan): boolean {
  // Check various ways a span might indicate an error
  if (span.statusCode && span.statusCode >= 400) {
    return true;
  }

  // Check for error-related attributes
  if (span.attributes) {
    // Common attribute names that might indicate errors
    const errorKeys = ['error', 'exception', 'failed', 'failure'];
    for (const key of errorKeys) {
      if (
        span.attributes[key] === true ||
        span.attributes[key] === 'true' ||
        (typeof span.attributes[key] === 'object' && span.attributes[key] !== null)
      ) {
        return true;
      }
    }

    // Check for HTTP status codes in attributes
    if (span.attributes['http.status_code'] && span.attributes['http.status_code'] >= 400) {
      return true;
    }

    // Check for OTEL standard error attributes
    if (
      span.attributes['otel.status_code'] === 'ERROR' ||
      span.attributes['status.code'] === 'ERROR'
    ) {
      return true;
    }
  }

  // Check status message for error indicators
  if (span.statusMessage) {
    const errorPatterns = /error|failed|failure|exception|timeout|abort/i;
    if (errorPatterns.test(span.statusMessage)) {
      return true;
    }
  }

  return false;
}

export const handleTraceErrorSpans = ({ assertion, context }: AssertionParams): GradingResult => {
  if (!context.trace || !context.trace.spans) {
    throw new Error('No trace data available for trace-error-spans assertion');
  }

  const value = assertion.value;
  let maxCount: number | undefined;
  let maxPercentage: number | undefined;
  let pattern = '*';

  // Handle simple number value for backwards compatibility
  if (typeof value === 'number') {
    maxCount = value;
  } else if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value !== 'function'
  ) {
    const objValue = value as TraceErrorSpansValue;
    maxCount = objValue.max_count;
    maxPercentage = objValue.max_percentage;
    pattern = objValue.pattern || '*';
  }

  if (maxCount === undefined && maxPercentage === undefined) {
    maxCount = 0; // Default to no errors allowed
  }

  const spans = context.trace.spans as TraceSpan[];

  // Filter spans by pattern
  const matchingSpans = spans.filter((span) => matchesPattern(span.name, pattern));

  if (matchingSpans.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: `No spans found matching pattern "${pattern}"`,
      assertion,
    };
  }

  // Find error spans
  const errorSpans = matchingSpans.filter(isErrorSpan);
  const errorCount = errorSpans.length;
  const errorPercentage = (errorCount / matchingSpans.length) * 100;

  let pass = true;
  let reason = '';

  if (maxCount !== undefined && errorCount > maxCount) {
    pass = false;
    const errorDetails = errorSpans.slice(0, 3).map((span) => {
      let detail = span.name;
      if (span.statusMessage) {
        detail += ` (${span.statusMessage})`;
      } else if (span.statusCode) {
        detail += ` (status: ${span.statusCode})`;
      }
      return detail;
    });

    reason = `Found ${errorCount} error spans, expected at most ${maxCount}. `;
    reason += `Errors: ${errorDetails.join(', ')}`;
    if (errorSpans.length > 3) {
      reason += ` and ${errorSpans.length - 3} more`;
    }
  } else if (maxPercentage !== undefined && errorPercentage > maxPercentage) {
    pass = false;
    reason = `Error rate ${errorPercentage.toFixed(1)}% exceeds threshold ${maxPercentage}% `;
    reason += `(${errorCount} errors out of ${matchingSpans.length} spans)`;
  } else {
    if (errorCount === 0) {
      reason = `No errors found in ${matchingSpans.length} spans matching pattern "${pattern}"`;
    } else {
      reason = `Found ${errorCount} error(s) in ${matchingSpans.length} spans (${errorPercentage.toFixed(1)}%)`;
      if (maxCount !== undefined) {
        reason += `, within threshold of ${maxCount}`;
      }
      if (maxPercentage !== undefined) {
        reason += `, within threshold of ${maxPercentage}%`;
      }
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
