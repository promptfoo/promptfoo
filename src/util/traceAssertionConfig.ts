/**
 * Shared config validation for trace and trajectory assertions.
 *
 * Each validator encodes the hardening rules (numeric bounds, ranges, percentile/method
 * enums, and boolean toggles) for an assertion's `value`, returning a human-readable error
 * message or `undefined` when the config is valid. Both the runtime assertion handlers
 * (which throw on the returned message) and the Eval Creator UI validators (which surface
 * it inline at save time) call these, so save-time and run-time validation cannot drift.
 *
 * This module lives in the shared `util` layer (not `src/assertions`, which is `core`) and
 * is intentionally dependency-light so the browser bundle can import it via
 * `@promptfoo/util/traceAssertionConfig` without crossing the app/core boundary.
 *
 * Validators only enforce the hardening rules; structural/presence requirements that
 * differ between the two surfaces (e.g. the UI requiring a span pattern, or the runtime
 * requiring a `goal`) stay with each caller.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNonNegativeNumberError(value: unknown, label: string): string | undefined {
  return Number.isFinite(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative number`;
}

function finiteNonNegativeIntegerError(value: unknown, label: string): string | undefined {
  return Number.isFinite(value) && Number.isInteger(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative integer`;
}

function validRangeError(
  min: number | undefined,
  max: number | undefined,
  label: string,
): string | undefined {
  return min !== undefined && max !== undefined && max < min
    ? `${label} max must be greater than or equal to min`
    : undefined;
}

/**
 * trace-span-count: requires at least one bound; `min`/`max` must be finite non-negative
 * integers with `max >= min`.
 */
export function traceSpanCountBoundsError(value: {
  min?: unknown;
  max?: unknown;
}): string | undefined {
  const { min, max } = value;
  if (min === undefined && max === undefined) {
    return 'trace-span-count assertion must include a min or max property';
  }
  if (min !== undefined) {
    const error = finiteNonNegativeIntegerError(min, 'trace-span-count assertion min');
    if (error) {
      return error;
    }
  }
  if (max !== undefined) {
    const error = finiteNonNegativeIntegerError(max, 'trace-span-count assertion max');
    if (error) {
      return error;
    }
  }
  return validRangeError(
    min as number | undefined,
    max as number | undefined,
    'trace-span-count assertion',
  );
}

/**
 * trace-span-duration: `max` must be a finite non-negative number, `pattern` a non-empty
 * string, `requirePresence` a boolean, and (only when a `percentile` is requested) the
 * percentile 0-100 with a `nearest`/`linear` method.
 */
export function traceSpanDurationConfigError(value: {
  pattern?: unknown;
  max?: unknown;
  percentile?: unknown;
  method?: unknown;
  requirePresence?: unknown;
}): string | undefined {
  const { pattern = '*', max, percentile, method = 'nearest', requirePresence = false } = value;
  const maxError = finiteNonNegativeNumberError(max, 'trace-span-duration assertion max');
  if (maxError) {
    return maxError;
  }
  if (typeof pattern !== 'string' || !pattern) {
    return 'trace-span-duration assertion pattern must be a non-empty string';
  }
  if (typeof requirePresence !== 'boolean') {
    return 'trace-span-duration assertion requirePresence must be a boolean';
  }
  if (percentile !== undefined) {
    if (
      !Number.isFinite(percentile) ||
      (percentile as number) < 0 ||
      (percentile as number) > 100
    ) {
      return 'trace-span-duration assertion percentile must be between 0 and 100';
    }
    if (method !== 'nearest' && method !== 'linear') {
      return 'trace-span-duration assertion method must be "nearest" or "linear"';
    }
  }
  return undefined;
}

/**
 * trace-error-spans: a number shorthand (max error-span count) or an object with optional
 * `max_count`/`max_percentage`/`pattern`/`requirePresence`. Non-object, non-number values
 * resolve to defaults at runtime, so they are accepted here too.
 */
export function traceErrorSpansConfigError(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return finiteNonNegativeIntegerError(value, 'trace-error-spans assertion max_count');
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  const { pattern, requirePresence, max_count: maxCount, max_percentage: maxPercentage } = value;
  if (pattern !== undefined && (typeof pattern !== 'string' || !pattern)) {
    return 'trace-error-spans assertion pattern must be a non-empty string';
  }
  if (requirePresence !== undefined && typeof requirePresence !== 'boolean') {
    return 'trace-error-spans assertion requirePresence must be a boolean';
  }
  if (maxCount !== undefined) {
    const error = finiteNonNegativeIntegerError(maxCount, 'trace-error-spans assertion max_count');
    if (error) {
      return error;
    }
  }
  if (maxPercentage !== undefined) {
    const error = finiteNonNegativeNumberError(
      maxPercentage,
      'trace-error-spans assertion max_percentage',
    );
    if (error) {
      return error;
    }
    if ((maxPercentage as number) > 100) {
      return 'trace-error-spans assertion max_percentage must be between 0 and 100';
    }
  }
  return undefined;
}

/**
 * trajectory:step-count / trajectory:tool-used count bounds: `min`/`max` must be finite
 * non-negative integers with `max >= min`. `assertionType` is interpolated into the
 * message so each assertion reports its own name.
 */
export function trajectoryCountBoundsError(
  value: { min?: unknown; max?: unknown },
  assertionType: string,
): string | undefined {
  const { min, max } = value;
  if (min !== undefined) {
    const error = finiteNonNegativeIntegerError(min, `${assertionType} assertion min`);
    if (error) {
      return error;
    }
  }
  if (max !== undefined) {
    const error = finiteNonNegativeIntegerError(max, `${assertionType} assertion max`);
    if (error) {
      return error;
    }
  }
  return validRangeError(
    min as number | undefined,
    max as number | undefined,
    `${assertionType} assertion`,
  );
}

/**
 * not-trajectory:tool-used object values are forbidden-use checks, matching not-skill-used.
 * Count ranges other than max: 0 are ambiguous after applying the `not-` prefix.
 */
export function notTrajectoryToolUsedBoundsError(value: {
  min?: unknown;
  max?: unknown;
}): string | undefined {
  const hasExplicitMin = value.min !== undefined;
  const hasExplicitMax = value.max !== undefined;
  if (hasExplicitMin || (hasExplicitMax && value.max !== 0)) {
    return 'not-trajectory:tool-used object assertions only support name/pattern with no count bounds, or max: 0';
  }
  return undefined;
}

/** trajectory:goal-success: an optional `timeoutMs` must be a finite positive number. */
export function trajectoryGoalSuccessTimeoutError(value: {
  timeoutMs?: unknown;
}): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, 'timeoutMs')) {
    return undefined;
  }
  const { timeoutMs } = value;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return 'trajectory:goal-success timeoutMs must be a finite positive number';
  }
  return undefined;
}

/**
 * trajectory:tool-sequence: an optional `mode` must be "in_order" or "exact". Only the
 * object form carries a mode (the array form defaults to "in_order").
 */
export function trajectoryToolSequenceModeError(value: { mode?: unknown }): string | undefined {
  const { mode } = value;
  if (mode !== undefined && mode !== 'in_order' && mode !== 'exact') {
    return 'trajectory:tool-sequence assertion mode must be "in_order" or "exact"';
  }
  return undefined;
}

/**
 * trajectory:tool-args-match: an optional `redactArgsInFailures` must be a boolean.
 * A stringy value like "true" must fail loud rather than fail open and leak traced args.
 */
export function trajectoryRedactArgsError(value: {
  redactArgsInFailures?: unknown;
}): string | undefined {
  const { redactArgsInFailures } = value;
  if (redactArgsInFailures !== undefined && typeof redactArgsInFailures !== 'boolean') {
    return 'trajectory:tool-args-match assertion redactArgsInFailures must be a boolean';
  }
  return undefined;
}
