import type { AssertionParams, GradingResult } from '../types';
import type { TraceSpan } from '../types/tracing';

interface TraceSpanDurationValue {
  pattern?: string;
  max: number;
  percentile?: number;
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

function calculatePercentile(durations: number[], percentile: number): number {
  if (durations.length === 0) {
    return 0;
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export const handleTraceSpanDuration = ({ assertion, context }: AssertionParams): GradingResult => {
  if (!context.trace || !context.trace.spans) {
    return {
      pass: false,
      score: 0,
      reason: 'No trace data available for trace-span-duration assertion',
      assertion,
    };
  }

  const value = assertion.value as TraceSpanDurationValue;
  if (!value || typeof value !== 'object' || typeof value.max !== 'number') {
    throw new Error('trace-span-duration assertion must have a value object with max property');
  }

  const { pattern = '*', max, percentile } = value;
  const spans = context.trace.spans as TraceSpan[];

  // Filter spans by pattern and calculate durations
  const matchingSpans = spans.filter((span) => {
    return (
      matchesPattern(span.name, pattern) &&
      span.startTime !== undefined &&
      span.endTime !== undefined
    );
  });

  if (matchingSpans.length === 0) {
    return {
      pass: true,
      score: 1,
      reason: `No spans found matching pattern "${pattern}" with complete timing data`,
      assertion,
    };
  }

  const spanDurations = matchingSpans.map((span) => {
    return {
      name: span.name,
      duration: span.endTime! - span.startTime,
    };
  });

  let pass = true;
  let reason = '';

  if (percentile === undefined) {
    // Check all spans
    const slowSpans = spanDurations.filter((s) => s.duration > max);

    if (slowSpans.length > 0) {
      pass = false;
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
    const percentileValue = calculatePercentile(durations, percentile);

    if (percentileValue > max) {
      pass = false;
      const slowestSpans = spanDurations
        .filter((s) => s.duration >= percentileValue)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);

      reason = `${percentile}th percentile duration (${percentileValue}ms) exceeds threshold ${max}ms. `;
      reason += `Slowest spans: ${slowestSpans.map((s) => `${s.name} (${s.duration}ms)`).join(', ')}`;
    } else {
      reason = `${percentile}th percentile duration (${percentileValue}ms) is within threshold ${max}ms`;
    }
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion,
  };
};
