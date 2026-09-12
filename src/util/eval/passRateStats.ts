/**
 * Statistics for pass rates.
 *
 * An observed pass rate is a point estimate: 17/20 passing says something very
 * different from 850/1000 passing, even though both round to 85%. The Wilson
 * score interval quantifies that difference without assuming large samples,
 * and behaves sensibly at 0% and 100% (where the naive normal interval
 * collapses to zero width).
 */

/**
 * Wilson score confidence interval for a binomial proportion.
 *
 * @param passes - Number of successes (0 <= passes <= total)
 * @param total - Number of trials
 * @param z - Standard-normal quantile for the confidence level (default 1.959964 ≈ 95%)
 * @returns Lower and upper bounds of the interval, as proportions in [0, 1]
 */
export function wilsonInterval(
  passes: number,
  total: number,
  z: number = 1.9599639845400545,
): { low: number; high: number } {
  if (total <= 0 || passes < 0 || passes > total) {
    return { low: 0, high: 1 };
  }
  const p = passes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return {
    low: Math.max(0, center - half),
    high: Math.min(1, center + half),
  };
}
