/**
 * Format elapsed time in milliseconds to a human-readable string
 */
export function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format large numbers with k/M suffixes
 */
export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}

/**
 * Estimate remaining time based on progress rate
 * Returns a human-readable string like "2m 30s"
 */
export function estimateTimeRemaining(progress: number, total: number, elapsedMs: number): string {
  if (progress <= 0 || total <= 0 || elapsedMs <= 0) {
    return '--';
  }

  // Calculate rate: items per ms
  const rate = progress / elapsedMs;
  const remaining = total - progress;

  if (rate <= 0 || remaining <= 0) {
    return '--';
  }

  // Estimated remaining time in ms
  const remainingMs = remaining / rate;

  // Cap at reasonable maximum (4 hours)
  const maxMs = 4 * 60 * 60 * 1000;
  if (remainingMs > maxMs) {
    return '>4h';
  }

  return formatElapsedTime(remainingMs);
}
