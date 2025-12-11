/**
 * Formatting utilities for the Ink UI.
 *
 * These utilities format numbers, durations, costs, and tokens
 * for display in the CLI interface.
 */

/**
 * Format a token count for display.
 *
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "12.4k", "1.2M")
 */
export function formatTokens(tokens: number): string {
  if (tokens === 0) {
    return '0';
  }
  if (tokens < 1000) {
    return tokens.toString();
  }
  if (tokens < 1_000_000) {
    const k = tokens / 1000;
    if (k >= 10) {
      return `${Math.round(k)}k`;
    }
    // Strip trailing .0 for cleaner display
    const formatted = k.toFixed(1);
    return formatted.endsWith('.0') ? `${Math.floor(k)}k` : `${formatted}k`;
  }
  const m = tokens / 1_000_000;
  if (m >= 10) {
    return `${Math.round(m)}M`;
  }
  // Strip trailing .0 for cleaner display
  const formatted = m.toFixed(1);
  return formatted.endsWith('.0') ? `${Math.floor(m)}M` : `${formatted}M`;
}

/**
 * Format a cost value for display.
 *
 * @param cost - Cost in dollars
 * @returns Formatted string (e.g., "$0.35", "$1.23")
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return '$0.00';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(2)}`;
  }
  if (cost < 10) {
    return `$${cost.toFixed(2)}`;
  }
  return `$${cost.toFixed(0)}`;
}

/**
 * Format a duration in milliseconds for display.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.2s", "2m 34s", "1h 23m")
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
  }
  if (ms < 3600_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.round((ms % 3600_000) / 60_000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Format latency for display.
 *
 * @param ms - Latency in milliseconds
 * @returns Formatted string (e.g., "1.2s", "234ms")
 */
export function formatLatency(ms: number): string {
  if (ms === 0 || !Number.isFinite(ms)) {
    return '-';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
}

/**
 * Calculate and format a percentage.
 *
 * @param value - Numerator
 * @param total - Denominator
 * @returns Formatted percentage string (e.g., "87%")
 */
export function formatPercent(value: number, total: number): string {
  if (total === 0) {
    return '0%';
  }
  const percent = (value / total) * 100;
  return `${Math.round(percent)}%`;
}

/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Format a rate (e.g., cache hit rate).
 *
 * @param hits - Number of hits
 * @param total - Total attempts
 * @returns Formatted string (e.g., "23 (45%)")
 */
export function formatRate(hits: number, total: number): string {
  if (total === 0) {
    return '0';
  }
  const percent = Math.round((hits / total) * 100);
  return `${hits} (${percent}%)`;
}

/**
 * Format average latency from total and count.
 *
 * @param totalMs - Total latency in milliseconds
 * @param count - Number of measurements
 * @returns Formatted average latency string
 */
export function formatAvgLatency(totalMs: number, count: number): string {
  if (count === 0) {
    return '-';
  }
  return formatLatency(totalMs / count);
}
