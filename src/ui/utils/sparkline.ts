/**
 * Sparkline utility for rendering compact latency trend visualizations.
 *
 * Sparklines are minimalist charts that show trends in a small space.
 * They're perfect for showing latency patterns in a terminal UI.
 *
 * Characters used (from lowest to highest):
 * ▁ ▂ ▃ ▄ ▅ ▆ ▇ █
 */

/**
 * The characters used for sparkline rendering, from lowest to highest.
 */
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/**
 * Maximum number of data points to display in a sparkline.
 */
export const MAX_SPARKLINE_POINTS = 10;

/**
 * Options for sparkline rendering.
 */
export interface SparklineOptions {
  /** Maximum number of points to display (default: MAX_SPARKLINE_POINTS) */
  maxPoints?: number;
  /** Minimum value for scaling (default: auto from data) */
  min?: number;
  /** Maximum value for scaling (default: auto from data) */
  max?: number;
  /** Character to use when there's no data */
  emptyChar?: string;
}

/**
 * Render a sparkline string from an array of numeric values.
 *
 * @param values - Array of numeric values (e.g., latency measurements in ms)
 * @param options - Rendering options
 * @returns A string of sparkline characters
 *
 * @example
 * ```ts
 * // Basic usage
 * renderSparkline([100, 200, 150, 300, 250])
 * // Returns: "▂▄▃▇▅"
 *
 * // With options
 * renderSparkline([100, 200, 150], { maxPoints: 5 })
 * // Returns: "▂█▄"
 * ```
 */
export function renderSparkline(values: number[], options: SparklineOptions = {}): string {
  const {
    maxPoints = MAX_SPARKLINE_POINTS,
    min: minOverride,
    max: maxOverride,
    emptyChar: _emptyChar = '▁',
  } = options;

  if (values.length === 0) {
    return '';
  }

  // Take only the most recent points
  const recentValues = values.slice(-maxPoints);

  // Calculate min and max for scaling
  const dataMin = Math.min(...recentValues);
  const dataMax = Math.max(...recentValues);
  const min = minOverride ?? dataMin;
  const max = maxOverride ?? dataMax;

  // Handle edge case where all values are the same
  const range = max - min;
  if (range === 0) {
    // All values are the same, use middle character
    return SPARK_CHARS[Math.floor(SPARK_CHARS.length / 2)].repeat(recentValues.length);
  }

  // Map each value to a sparkline character
  return recentValues
    .map((value) => {
      // Clamp value to min/max range
      const clamped = Math.max(min, Math.min(max, value));
      // Normalize to 0-1
      const normalized = (clamped - min) / range;
      // Map to character index (0 to SPARK_CHARS.length - 1)
      const charIndex = Math.min(
        SPARK_CHARS.length - 1,
        Math.floor(normalized * SPARK_CHARS.length),
      );
      return SPARK_CHARS[charIndex];
    })
    .join('');
}

/**
 * Calculate statistics from sparkline data.
 *
 * @param values - Array of numeric values
 * @returns Object with min, max, avg, and trend
 */
export function getSparklineStats(values: number[]): {
  min: number;
  max: number;
  avg: number;
  trend: 'up' | 'down' | 'stable';
} {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, trend: 'stable' };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  // Calculate trend based on first half vs second half average
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (values.length >= 4) {
    const mid = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const threshold = avg * 0.1; // 10% threshold for trend detection

    if (secondAvg - firstAvg > threshold) {
      trend = 'up';
    } else if (firstAvg - secondAvg > threshold) {
      trend = 'down';
    }
  }

  return { min, max, avg, trend };
}

/**
 * Get a trend indicator character.
 *
 * @param trend - The trend direction
 * @returns A Unicode arrow character
 */
export function getTrendIndicator(trend: 'up' | 'down' | 'stable'): string {
  switch (trend) {
    case 'up':
      return '↑';
    case 'down':
      return '↓';
    case 'stable':
      return '→';
  }
}
