/**
 * Computes a percentile value using linear interpolation (PERCENTILE.INC method).
 * This gives distinct values for p95/p99 even with small sample sizes.
 *
 * @param sortedArr - Pre-sorted array of numbers (ascending)
 * @param p - Percentile to compute (0-1)
 * @returns The interpolated percentile value
 */
export function getPercentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) {
    return 0;
  }
  if (sortedArr.length === 1) {
    return sortedArr[0];
  }
  const rank = p * (sortedArr.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) {
    return sortedArr[lower];
  }
  const fraction = rank - lower;
  return sortedArr[lower] + fraction * (sortedArr[upper] - sortedArr[lower]);
}
