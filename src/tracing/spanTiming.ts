import type { TraceSpan } from '../types/tracing';

export const HOSTED_START_TIME_OFFSET_NS = 'promptfoo.openai.start_time_offset_ns';
export const HOSTED_DURATION_NS = 'promptfoo.openai.duration_ns';

export function nativeStartOffsetNs(span: TraceSpan): number {
  const offset = span.attributes?.[HOSTED_START_TIME_OFFSET_NS];
  return typeof span.attributes?.['promptfoo.openai.hosted_trace'] === 'string' &&
    Number.isSafeInteger(offset)
    ? offset
    : 0;
}

function hasNativeDuration(span: TraceSpan): boolean {
  return (
    typeof span.attributes?.['promptfoo.openai.hosted_trace'] === 'string' &&
    Object.prototype.hasOwnProperty.call(span.attributes, HOSTED_DURATION_NS)
  );
}

export function getNativeSpanDurationNs(span: TraceSpan): bigint | undefined {
  const raw = span.attributes?.[HOSTED_DURATION_NS];
  if (
    !hasNativeDuration(span) ||
    typeof raw !== 'string' ||
    !/^(?:0|[1-9]\d{0,19})$/.test(raw) ||
    !Number.isFinite(span.startTime) ||
    !Number.isFinite(span.endTime) ||
    span.startTime < 0 ||
    span.startTime > Number(0xffffffffffffffffn) / 1e6
  ) {
    return undefined;
  }
  const duration = BigInt(raw);
  const start = BigInt(Math.round(span.startTime * 1e6)) + BigInt(nativeStartOffsetNs(span));
  const end = start + duration;
  return start > 0n && end <= 0xffffffffffffffffn && Number(end) / 1e6 === span.endTime
    ? duration
    : undefined;
}

export function getTraceSpanDurationMs(span: TraceSpan): number | undefined {
  if (hasNativeDuration(span)) {
    const duration = getNativeSpanDurationNs(span);
    return duration === undefined ? undefined : Number(duration) / 1e6;
  }
  return span.endTime !== undefined &&
    Number.isFinite(span.startTime) &&
    Number.isFinite(span.endTime) &&
    span.endTime >= span.startTime
    ? span.endTime - span.startTime
    : undefined;
}

export function traceSpanDurationWithinMax(span: TraceSpan, max: number): boolean {
  if (!hasNativeDuration(span)) {
    return (getTraceSpanDurationMs(span) ?? NaN) <= max;
  }
  const duration = getNativeSpanDurationNs(span);
  if (duration === undefined || !(max >= 0) || max === Infinity) {
    return duration !== undefined && max === Infinity;
  }
  // Compare against the configured decimal milliseconds. Scaling either operand as a
  // Number loses nanoseconds at large durations or rounds boundaries such as 1.000001ms.
  const [mantissa, exponent = '0'] = String(max).split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = BigInt(integer + fraction);
  const scale = Number(exponent) + 6 - fraction.length;
  return scale >= 0
    ? duration <= digits * 10n ** BigInt(scale)
    : duration * 10n ** BigInt(-scale) <= digits;
}
