// Shared value checks for trace assertion handlers and the Eval Creator.
function finiteNonNegativeNumberError(value: unknown, label: string): string | undefined {
  return Number.isFinite(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative number`;
}

function finiteNonNegativeIntegerError(value: unknown, label: string): string | undefined {
  return Number.isInteger(value) && (value as number) >= 0
    ? undefined
    : `${label} must be a finite non-negative integer`;
}

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
  return min !== undefined && max !== undefined && (max as number) < (min as number)
    ? 'trace-span-count assertion max must be greater than or equal to min'
    : undefined;
}

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
  if (typeof pattern !== 'string' || !pattern.trim()) {
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

export function traceErrorSpansConfigError(value: unknown): string | undefined {
  if (typeof value === 'number') {
    return finiteNonNegativeIntegerError(value, 'trace-error-spans assertion max_count');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const {
    pattern,
    requirePresence,
    max_count: maxCount,
    max_percentage: maxPercentage,
  } = value as Record<string, unknown>;
  if (pattern !== undefined && (typeof pattern !== 'string' || !pattern.trim())) {
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
