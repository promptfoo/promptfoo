export interface SpanStatus {
  bgClass: string;
  textClass: string;
  label: string;
}

const STATUS_OK: SpanStatus = {
  bgClass: 'bg-emerald-500',
  textClass: 'text-emerald-600 dark:text-emerald-400',
  label: 'OK',
};

const STATUS_ERROR: SpanStatus = {
  bgClass: 'bg-red-500',
  textClass: 'text-red-600 dark:text-red-400',
  label: 'ERROR',
};

const STATUS_UNSET: SpanStatus = {
  bgClass: 'bg-primary',
  textClass: 'text-foreground',
  label: 'UNSET',
};

/**
 * Get display status for a span based on OpenTelemetry status code.
 * Handles numeric codes (0, 1, 2), string numbers ("1", "2"), and string values ("ok", "error").
 *
 * @see https://opentelemetry.io/docs/specs/otel/trace/api/#set-status
 * SpanStatusCode: UNSET = 0, OK = 1, ERROR = 2
 */
export function getSpanStatus(statusCode?: number | string | null): SpanStatus {
  if (statusCode == null) {
    return STATUS_UNSET;
  }

  const normalized = String(statusCode).toLowerCase();

  if (normalized === '1' || normalized === 'ok') {
    return STATUS_OK;
  }
  if (normalized === '2' || normalized === 'error') {
    return STATUS_ERROR;
  }

  return STATUS_UNSET;
}

/**
 * Format a duration in milliseconds for display.
 * Returns "<1ms" for sub-millisecond, "Xms" for < 1s, "X.XXs" for >= 1s.
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1) {
    return '<1ms';
  }
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

/**
 * Format a Unix timestamp (milliseconds) as an ISO string.
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}
