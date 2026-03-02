/**
 * Formatting utilities for the Ink UI.
 *
 * These utilities format numbers, durations, costs, and tokens
 * for display in the CLI interface.
 */

/**
 * Format a number with one decimal, stripping trailing ".0".
 */
function formatCompact(value: number, suffix: string): string {
  if (value >= 10) {
    return `${Math.round(value)}${suffix}`;
  }
  const formatted = value.toFixed(1);
  return formatted.endsWith('.0') ? `${Math.floor(value)}${suffix}` : `${formatted}${suffix}`;
}

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
    return formatCompact(tokens / 1000, 'k');
  }
  return formatCompact(tokens / 1_000_000, 'M');
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
  if (!Number.isFinite(ms) || ms < 0) {
    return '-';
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`;
  }
  if (ms < 3600_000) {
    const minutes = Math.floor(ms / 60_000);
    const seconds = Math.round((ms % 60_000) / 1000);
    if (seconds === 60) {
      return `${minutes + 1}m`;
    }
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.round((ms % 3600_000) / 60_000);
  if (minutes === 60) {
    return `${hours + 1}h`;
  }
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
 * Get a color for a percentage value (pass rate, score, etc.).
 *
 * @param percent - Percentage value (0-100)
 * @returns Color name: 'green' for >=80, 'yellow' for >=50, 'red' for <50
 */
export function getScoreColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 80) {
    return 'green';
  }
  if (percent >= 50) {
    return 'yellow';
  }
  return 'red';
}

/**
 * Truncate a string to a maximum length with ellipsis.
 * Handles Unicode properly by not cutting through multi-byte characters.
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  // Use spread operator to properly split by code points, not code units
  // This prevents cutting through surrogate pairs (emojis, etc.)
  const codePoints = [...str];
  if (codePoints.length <= maxLength) {
    return str;
  }
  return codePoints.slice(0, maxLength - 1).join('') + '…';
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

/**
 * Calculate estimated time remaining based on progress.
 *
 * @param completed - Number of completed items
 * @param total - Total number of items
 * @param elapsedMs - Elapsed time in milliseconds
 * @returns Estimated remaining time in milliseconds, or null if cannot calculate
 */
export function calculateETA(completed: number, total: number, elapsedMs: number): number | null {
  // Need at least some progress and time elapsed to estimate
  if (completed === 0 || elapsedMs === 0 || total === 0) {
    return null;
  }

  // Don't show ETA if already complete
  if (completed >= total) {
    return 0;
  }

  // Calculate throughput and estimate remaining time
  const throughput = completed / elapsedMs; // items per ms
  const remaining = total - completed;
  const etaMs = remaining / throughput;

  // Only return ETA if it seems reasonable (not too long)
  // Cap at 24 hours to avoid unrealistic estimates
  if (etaMs > 24 * 60 * 60 * 1000) {
    return null;
  }

  return etaMs;
}

/**
 * Format ETA for display.
 *
 * @param etaMs - Estimated time remaining in milliseconds, or null
 * @returns Formatted string (e.g., "~2m 30s left") or empty string if no ETA
 */
export function formatETA(etaMs: number | null): string {
  if (etaMs === null || etaMs === 0) {
    return '';
  }
  return `~${formatDuration(etaMs)} left`;
}

/**
 * Format bytes for human-readable display.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB", "256 KB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0 || !Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Pad text to a specific width.
 * Handles Unicode properly by using code points instead of UTF-16 code units.
 *
 * @param text - Text to pad
 * @param width - Target width in characters
 * @param align - Alignment: 'left' (default), 'right', or 'center'
 * @param shouldTruncate - If true, truncate text that exceeds width (default: false)
 * @returns Padded (and optionally truncated) string
 */
export function padText(
  text: string,
  width: number,
  align: 'left' | 'right' | 'center' = 'left',
  shouldTruncate = false,
): string {
  const codePoints = [...text];
  if (codePoints.length > width) {
    return shouldTruncate ? codePoints.slice(0, width).join('') : text;
  }
  if (codePoints.length === width) {
    return text;
  }

  const padding = width - codePoints.length;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Truncate text to a maximum length, normalizing whitespace.
 * Handles Unicode properly by using code points instead of UTF-16 code units.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis
 * @returns Object with truncated text and whether truncation occurred
 */
export function truncateText(
  text: string,
  maxLength: number,
): { text: string; truncated: boolean } {
  const normalized = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  const codePoints = [...normalized];
  if (codePoints.length <= maxLength) {
    return { text: normalized, truncated: false };
  }
  if (maxLength <= 3) {
    return { text: '...'.slice(0, maxLength), truncated: true };
  }
  return { text: codePoints.slice(0, maxLength - 1).join('') + '…', truncated: true };
}
