/**
 * Calculate pass^N metrics for repeated test runs.
 *
 * When using --repeat N, this function calculates:
 * - pass^N: Probability that ALL N attempts pass (pessimistic metric)
 * - pass_rate: Overall pass rate across all attempts
 * - flip_rate: How often pass/fail status changes between attempts
 * - Score statistics (mean, stddev, min, max)
 * - Latency statistics (mean, p95, p99)
 *
 * @param {Object} context - Post-processing context
 * @param {Array} context.results - All evaluation results
 * @param {Object} context.options - Evaluation options (includes repeat count)
 * @returns {Object} Map of metric names to values
 */
module.exports = function calculateRepeatStats(context) {
  const { results, options } = context;
  const repeat = options.repeat || 1;

  // Only calculate if repeat > 1
  if (repeat <= 1) {
    return {};
  }

  // Group results by test case (promptIdx_testIdx)
  const testGroups = {};
  for (const result of results) {
    const key = `${result.promptIdx}_${result.testIdx}`;
    if (!testGroups[key]) {
      testGroups[key] = [];
    }
    testGroups[key].push(result);
  }

  // Calculate metrics for each test group
  const passNs = [];
  const passRates = [];
  const flipRates = [];
  const allScores = [];
  const allLatencies = [];

  for (const [key, testResults] of Object.entries(testGroups)) {
    // Skip if we don't have the expected number of results
    if (testResults.length !== repeat) {
      console.warn(`Test ${key} has ${testResults.length} results, expected ${repeat}`);
      continue;
    }

    // Calculate pass rate for this test
    const passCount = testResults.filter((r) => r.success).length;
    const passRate = passCount / repeat;
    passRates.push(passRate);

    // Calculate pass^N (probability all N pass)
    const passN = Math.pow(passRate, repeat);
    passNs.push(passN);

    // Calculate flip rate (how often pass/fail status changes)
    let flips = 0;
    for (let i = 1; i < testResults.length; i++) {
      if (testResults[i].success !== testResults[i - 1].success) {
        flips++;
      }
    }
    const flipRate = testResults.length > 1 ? flips / (testResults.length - 1) : 0;
    flipRates.push(flipRate);

    // Collect scores
    for (const result of testResults) {
      allScores.push(result.score);
    }

    // Collect latencies (if available)
    for (const result of testResults) {
      if (result.latencyMs !== undefined && result.latencyMs !== null) {
        allLatencies.push(result.latencyMs);
      }
    }
  }

  // Aggregate metrics across all test groups
  const metrics = {};

  if (passNs.length > 0) {
    metrics['repeat.pass_n'] = passNs.reduce((sum, val) => sum + val, 0) / passNs.length;
    metrics['repeat.pass_rate'] = passRates.reduce((sum, val) => sum + val, 0) / passRates.length;
    metrics['repeat.flip_rate'] = flipRates.reduce((sum, val) => sum + val, 0) / flipRates.length;
  }

  // Score statistics
  if (allScores.length > 0) {
    const mean = allScores.reduce((sum, val) => sum + val, 0) / allScores.length;
    metrics['repeat.score.mean'] = mean;

    // Standard deviation
    const variance =
      allScores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allScores.length;
    metrics['repeat.score.stddev'] = Math.sqrt(variance);

    metrics['repeat.score.min'] = Math.min(...allScores);
    metrics['repeat.score.max'] = Math.max(...allScores);
  }

  // Latency statistics
  if (allLatencies.length > 0) {
    const mean = allLatencies.reduce((sum, val) => sum + val, 0) / allLatencies.length;
    metrics['repeat.latency.mean'] = mean;

    // Calculate percentiles
    const sorted = [...allLatencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    metrics['repeat.latency.p95'] = sorted[p95Index];
    metrics['repeat.latency.p99'] = sorted[p99Index];
  }

  return metrics;
};
