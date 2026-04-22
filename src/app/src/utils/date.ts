/**
 * Utility functions for date and duration formatting
 */

/**
 * Validates that a duration value is a finite positive number.
 * Use this to guard against NaN, Infinity, negative numbers, or non-number types.
 *
 * @param ms - The value to validate
 * @returns True if the value is a valid duration (finite number >= 0)
 */
export function isValidDuration(ms: unknown): ms is number {
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0;
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Returns null for invalid inputs (NaN, Infinity, negative, non-number).
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "342ms", "2.3s", "1m 45s", "1h 23m", or null if invalid
 *
 * @example
 * formatDuration(500)      // "500ms"
 * formatDuration(2300)     // "2.3s"
 * formatDuration(125000)   // "2m 5s"
 * formatDuration(3661000)  // "1h 1m"
 * formatDuration(NaN)      // null
 * formatDuration(-1000)    // null
 */
export function formatDuration(ms: number): string | null {
  if (!isValidDuration(ms)) {
    return null;
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Calculate minutes and seconds, handling rounding overflow
  let minutes = Math.floor(ms / 60000);
  let seconds = Math.round((ms % 60000) / 1000);

  // Handle edge case where seconds rounds to 60
  if (seconds === 60) {
    minutes += 1;
    seconds = 0;
  }

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  // Calculate hours and remaining minutes
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format a date value for display in DataGrid columns.
 * Uses locale string with short timezone name.
 *
 * @param value - The date value to format (string, number, or Date)
 * @returns Formatted date string with timezone, or empty string if value is invalid
 */
export function formatDataGridDate(value: string | number | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
