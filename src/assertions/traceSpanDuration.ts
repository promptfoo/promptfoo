import { traceSpanDurationConfigError } from '../util/traceAssertionConfig';
import { matchesPattern } from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';

type PercentileMethod = 'nearest' | 'linear';

interface TraceSpanDurationValue {
  pattern?: string;
  max: number;
  percentile?: number;
  method?: PercentileMethod;
  requirePresence?: boolean;
}

const PERCENTILE_LARGE_SAMPLE_THRESHOLD = 20;

function buildNoMatchingSpansResult({
  assertion,
  inverse,
  pattern,
  requirePresence,
}: Pick<AssertionParams, 'assertion' | 'inverse'> & {
  pattern: string;
  requirePresence: boolean;
}): GradingResult {
  const basePass = !requirePresence;
  const pass = inverse ? false : basePass;
  const baseReason = requirePresence
    ? `No spans found matching pattern "${pattern}" with complete timing data (requirePresence: true)`
    : `No spans found matching pattern "${pattern}" with complete timing data`;
  const reason = inverse
    ? requirePresence
      ? `not-trace-span-duration: no spans matched pattern "${pattern}" while requirePresence is true`
      : `not-trace-span-duration: no spans matched pattern "${pattern}", so the latency budget was satisfied and violates the inverse assertion`
    : baseReason;

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
}

function calculatePercentile(
  durations: number[],
  percentile: number,
  method: PercentileMethod = 'nearest',
): number {
  if (durations.length === 0) {
    return 0;
  }

  const sorted = [...durations].sort((a, b) => a - b);

  if (method === 'linear') {
    if (sorted.length === 1) {
      return sorted[0];
    }
    // Linear interpolation between closest ranks (NumPy "linear" / Excel PERCENTILE.INC).
    const rank = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.min(sorted.length - 1, lower + 1);
    const weight = rank - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  }

  // Nearest-rank (default): index = ceil((p/100) * N) - 1, equivalent to max for small N.
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export const handleTraceSpanDuration = ({
  assertion,
  assertionValueContext,
  inverse,
}: AssertionParams): GradingResult => {
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-span-duration assertion');
  }

  const value = assertion.value as TraceSpanDurationValue;
  if (!value || typeof value !== 'object' || typeof value.max !== 'number') {
    throw new Error('trace-span-duration assertion must have a value object with max property');
  }

  const { pattern = '*', max, percentile, method = 'nearest', requirePresence = false } = value;
  // `method` and `percentile` only affect the percentile path, so the shared validator
  // only enforces them when a percentile is requested (avoids rejecting a valid plain
  // max-duration config over an unused method).
  const configError = traceSpanDurationConfigError(value);
  if (configError) {
    throw new Error(configError);
  }
  const spans = assertionValueContext.trace.spans as TraceSpan[];

  // Filter spans by pattern and calculate durations
  const matchingSpans = spans.filter((span) => {
    return (
      matchesPattern(span.name, pattern) &&
      span.startTime !== undefined &&
      span.endTime !== undefined
    );
  });

  if (matchingSpans.length === 0) {
    return buildNoMatchingSpansResult({ assertion, inverse, pattern, requirePresence });
  }

  const spanDurations = matchingSpans.map((span) => {
    return {
      name: span.name,
      // Clamp to 0: a clock-skewed span (endTime < startTime) would otherwise yield a negative
      // duration that sorts as "fast" and renders a nonsensical negative-ms reason.
      duration: Math.max(0, span.endTime! - span.startTime),
    };
  });

  let basePass = true;
  let reason = '';

  if (percentile === undefined) {
    // Check all spans
    const slowSpans = spanDurations.filter((s) => s.duration > max);

    if (slowSpans.length > 0) {
      basePass = false;
      const top3Slow = slowSpans.sort((a, b) => b.duration - a.duration).slice(0, 3);

      reason = `${slowSpans.length} span(s) exceed duration threshold ${max}ms. `;
      reason += `Slowest: ${top3Slow.map((s) => `${s.name} (${s.duration}ms)`).join(', ')}`;
    } else {
      const maxDuration = Math.max(...spanDurations.map((s) => s.duration));
      reason = `All ${matchingSpans.length} spans matching pattern "${pattern}" completed within ${max}ms (max: ${maxDuration}ms)`;
    }
  } else {
    // Check percentile
    const durations = spanDurations.map((s) => s.duration);
    const percentileValue = calculatePercentile(durations, percentile, method);
    const smallSampleNote =
      durations.length < PERCENTILE_LARGE_SAMPLE_THRESHOLD
        ? ` (warning: small sample N=${durations.length}; ${percentile}th percentile is approximate, prefer max or aggregate across more rows)`
        : '';

    if (percentileValue > max) {
      basePass = false;
      const slowestSpans = spanDurations
        .filter((s) => s.duration >= percentileValue)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);

      reason = `${percentile}th percentile duration (${percentileValue.toFixed(2)}ms, method=${method}) exceeds threshold ${max}ms${smallSampleNote}. `;
      reason += `Slowest spans: ${slowestSpans.map((s) => `${s.name} (${s.duration}ms)`).join(', ')}`;
    } else {
      reason = `${percentile}th percentile duration (${percentileValue.toFixed(2)}ms, method=${method}) is within threshold ${max}ms${smallSampleNote}`;
    }
  }

  const pass = inverse ? !basePass : basePass;
  if (inverse) {
    reason = basePass
      ? `not-trace-span-duration: latency budget for pattern "${pattern}" was satisfied, which violates the inverse assertion`
      : `not-trace-span-duration: latency budget for pattern "${pattern}" was exceeded, which is the expected outcome for the inverse assertion`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
