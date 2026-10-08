import { traceSpanDurationConfigError } from '../contracts/validators/traceAssertionConfig';
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

  // Nearest-rank returns an observed duration.
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export const handleTraceSpanDuration = ({
  assertion,
  assertionValueContext,
  inverse,
  renderedValue,
}: AssertionParams): GradingResult => {
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-span-duration assertion');
  }

  const value = (renderedValue ?? assertion.value) as TraceSpanDurationValue;
  if (!value || typeof value !== 'object' || typeof value.max !== 'number') {
    throw new Error('trace-span-duration assertion must have a value object with max property');
  }

  const { pattern = '*', max, percentile, method = 'nearest', requirePresence = false } = value;
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
    const pass = !inverse && !requirePresence;
    const reason = inverse
      ? requirePresence
        ? `not-trace-span-duration: no spans matched pattern "${pattern}" while requirePresence is true`
        : `not-trace-span-duration: no spans matched pattern "${pattern}", so the latency budget was satisfied`
      : `No spans found matching pattern "${pattern}" with complete timing data${requirePresence ? ' (requirePresence: true)' : ''}`;
    return { pass, score: pass ? 1 : 0, reason, assertion };
  }

  if (
    matchingSpans.some(
      (span) =>
        !Number.isFinite(span.startTime) ||
        !Number.isFinite(span.endTime) ||
        span.endTime! < span.startTime,
    )
  ) {
    throw new Error('trace-span-duration assertion encountered a span with invalid timing data');
  }

  const spanDurations = matchingSpans.map((span) => {
    return {
      name: span.name,
      duration: span.endTime! - span.startTime,
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

    if (percentileValue > max) {
      basePass = false;
      const slowestSpans = spanDurations
        .filter((s) => s.duration >= percentileValue)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);

      reason = `${percentile}th percentile duration (${percentileValue.toFixed(2)}ms, method=${method}) exceeds threshold ${max}ms. `;
      reason += `Slowest spans: ${slowestSpans.map((s) => `${s.name} (${s.duration}ms)`).join(', ')}`;
    } else {
      reason = `${percentile}th percentile duration (${percentileValue.toFixed(2)}ms, method=${method}) is within threshold ${max}ms`;
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
