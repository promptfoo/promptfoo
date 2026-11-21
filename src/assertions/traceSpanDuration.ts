import { getTraceSpanDurationMs, traceSpanDurationWithinMax } from '../tracing/spanTiming';
import {
  filterTraceSpans,
  finishTraceAssertion,
  withTraceAttributeFilterContext,
} from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';
import type { TraceSpanAttributeFilter } from './traceUtils';

interface TraceSpanDurationValue {
  pattern?: string;
  max: number;
  percentile?: number;
  attributes?: TraceSpanAttributeFilter;
}

function calculatePercentile(durations: number[], percentile: number): number {
  if (durations.length === 0) {
    return 0;
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/** An empty match succeeds. With unbounded optional matches only finite selections can occur. */
function meetsDurationThreshold(within: number, over: number, percentile: number): boolean {
  if (over === 0) {
    return true;
  }
  if (percentile / 100 === 0) {
    return within > 0;
  }
  if (percentile === 100 || over === Infinity) {
    return false;
  }
  return within >= Math.max(1, Math.ceil((percentile / 100) * (within + over)));
}

function measureSpans(spans: TraceSpan[], hosted: boolean, max: number) {
  const timings = [];
  for (const span of spans) {
    if (span.startTime === undefined || span.endTime === undefined) {
      continue;
    }
    const duration = hosted ? getTraceSpanDurationMs(span) : span.endTime - span.startTime;
    if (duration !== undefined) {
      const within = hosted ? traceSpanDurationWithinMax(span, max) : !(duration > max);
      timings.push({ name: span.name, duration, within });
    }
  }
  return timings;
}

function gradeUncertainDuration(
  params: AssertionParams,
  { max, percentile = 100, attributes }: TraceSpanDurationValue,
  count: number,
  spanDurations: ReturnType<typeof measureSpans>,
): GradingResult {
  const uncertainty = params.traceSpanUncertainty;
  const untimed = count - spanDurations.length;
  const within = spanDurations.filter((span) => span.within).length;
  const over = spanDurations.length - within;
  const optional = uncertainty?.candidates ?? [];
  const optionalTimed = measureSpans(optional, true, max);
  const optionalWithin = optionalTimed.filter((span) => span.within).length;
  const optionalOver = optionalTimed.length - optionalWithin;
  const optionalUntimed = (uncertainty?.missing ?? 0) + optional.length - optionalTimed.length;
  const unknown = untimed + optionalUntimed;
  // Minimize/maximize the fraction within the threshold by including only favorable/unfavorable
  // optional spans. Missing durations may take any nonnegative value.
  const couldPass = meetsDurationThreshold(
    within + optionalWithin + (max >= 0 ? unknown : 0),
    over + (max < 0 ? untimed : 0),
    percentile,
  );
  const mustPass = meetsDurationThreshold(
    within + (max === Infinity ? untimed : 0),
    over + optionalOver + (max < Infinity ? unknown : 0),
    percentile,
  );
  const possible = (uncertainty?.missing ?? 0) + optional.length;
  const extra = Number.isFinite(possible)
    ? `Up to ${possible} additional spans can match.`
    : 'The number of additional matches is unbounded.';
  const details = `${count} definite matching span(s), ${untimed} with incomplete timing data. ${extra}`;
  if (couldPass && !mustPass) {
    return {
      pass: false,
      score: 0,
      reason: withTraceAttributeFilterContext(
        `${uncertainty?.reason ?? 'Timing evidence is incomplete.'} ${details} The possible durations do not determine the ${percentile}th percentile limit of ${max}ms.`,
        attributes,
      ),
      assertion: params.assertion,
    };
  }
  const outcome = mustPass ? 'satisfy' : 'exceed';
  return finishTraceAssertion(
    params,
    mustPass,
    `${details} All possible outcomes ${outcome} the ${percentile}th percentile limit of ${max}ms.`,
    attributes,
  );
}

export const handleTraceSpanDuration = (params: AssertionParams): GradingResult => {
  const { assertion, assertionValueContext, renderedValue } = params;
  if (!assertionValueContext.trace || !assertionValueContext.trace.spans) {
    throw new Error('No trace data available for trace-span-duration assertion');
  }

  const value = (renderedValue ?? assertion.value) as TraceSpanDurationValue;
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.max !== 'number' ||
    Number.isNaN(value.max)
  ) {
    throw new Error('trace-span-duration assertion must have a value object with max property');
  }

  const { pattern = '*', max, percentile, attributes } = value;

  if (
    percentile !== undefined &&
    (!Number.isFinite(percentile) || percentile < 0 || percentile > 100)
  ) {
    throw new Error('trace-span-duration assertion percentile must be a number between 0 and 100');
  }

  const spans = assertionValueContext.trace.spans as TraceSpan[];

  const hosted = params.providerResponse.metadata?.hostedTrace?.source === 'openai:agents-api';
  const matches = filterTraceSpans(spans, pattern, attributes);
  const spanDurations = measureSpans(matches, hosted, max);
  if (hosted && (matches.length > spanDurations.length || params.traceSpanUncertainty)) {
    return gradeUncertainDuration(params, value, matches.length, spanDurations);
  }

  if (spanDurations.length === 0) {
    return finishTraceAssertion(
      params,
      true,
      `No spans found matching pattern "${pattern}" with complete timing data`,
      attributes,
    );
  }

  // An exact native duration just over the limit can round to the limit in milliseconds.
  const formatSlowDuration = (duration: number) =>
    `${duration}ms${duration <= max ? ' rounded' : ''}`;
  let pass = true;
  let reason = '';

  if (percentile === undefined) {
    // Check all spans
    const slowSpans = spanDurations.filter((s) => !s.within);

    if (slowSpans.length > 0) {
      pass = false;
      const top3Slow = slowSpans.sort((a, b) => b.duration - a.duration).slice(0, 3);

      reason = `${slowSpans.length} span(s) exceed duration threshold ${max}ms. `;
      reason += `Slowest: ${top3Slow.map((s) => `${s.name} (${formatSlowDuration(s.duration)})`).join(', ')}`;
    } else {
      const maxDuration = Math.max(...spanDurations.map((s) => s.duration));
      reason = `All ${spanDurations.length} spans matching pattern "${pattern}" completed within ${max}ms (max: ${maxDuration}ms)`;
    }
  } else {
    // Check percentile
    const durations = spanDurations.map((s) => s.duration);
    const percentileValue = calculatePercentile(durations, percentile);

    // The displayed milliseconds may round two native durations to the same number.
    const within = spanDurations.filter((span) => span.within).length;
    if (meetsDurationThreshold(within, spanDurations.length - within, percentile)) {
      reason = `${percentile}th percentile duration (${percentileValue}ms) is within threshold ${max}ms`;
    } else {
      pass = false;
      const slowestSpans = spanDurations
        .filter((s) => !s.within && s.duration >= percentileValue)
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3);

      reason = `${percentile}th percentile duration (${formatSlowDuration(percentileValue)}) exceeds threshold ${max}ms. `;
      reason += `Slowest spans: ${slowestSpans.map((s) => `${s.name} (${formatSlowDuration(s.duration)})`).join(', ')}`;
    }
  }

  return finishTraceAssertion(params, pass, reason, attributes);
};
