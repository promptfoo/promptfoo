/**
 * Calculate repeat statistics when tests are run multiple times (--repeat N)
 *
 * This function is designed to be used as a post-processing derived metric:
 *
 * derivedMetrics:
 *   - name: repeat_stats
 *     value: file://./node_modules/promptfoo/dist/src/metrics/repeatStats.js
 *     phase: post
 *
 * @param {Object} context - Post-processing context
 * @param {Array} context.results - All evaluation results
 * @param {Array} context.prompts - All prompts used
 * @param {Object} context.stats - Current evaluation statistics
 * @param {Object} context.options - Evaluation options
 * @param {number} context.options.repeat - Number of repeats (from --repeat flag)
 * @returns {Object} Map of metric names to aggregate values
 */
function calculateRepeatStats(context) {
  const { results, options } = context;
  const { repeat } = options;

  // If repeat is 1 or less, no need for repeat statistics
  if (!repeat || repeat <= 1) {
    return {};
  }

  // Calculate the base number of unique tests (total results / repeat)
  const numUniqueTests = results.length / repeat;

  // Group results by unique test case (promptIdx, baseTestIdx)
  // When using --repeat N, testIdx increases sequentially across all repeats
  // For example, with 4 tests and 3 repeats: test 0 has testIdx [0, 4, 8]
  // We need to map these back to the base test index using modulo
  const grouped = {};
  for (const result of results) {
    const baseTestIdx = result.testIdx % numUniqueTests;
    const key = `${result.promptIdx}_${baseTestIdx}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(result);
  }

  // Calculate metrics for each test group
  const allPassN = [];
  const allPassRates = [];
  const allFlipRates = [];
  const allScores = [];
  const allLatencies = [];

  for (const [key, testResults] of Object.entries(grouped)) {
    // Skip if we don't have the expected number of results
    if (testResults.length !== repeat) {
      console.warn(`Test ${key} has ${testResults.length} results, expected ${repeat}`);
      continue;
    }

    // Calculate pass rate for this test
    const passes = testResults.filter(r => r.success).length;
    const passRate = passes / testResults.length;
    allPassRates.push(passRate);

    // Calculate pass^N (probability all N attempts pass)
    const passN = Math.pow(passRate, repeat);
    allPassN.push(passN);

    // Calculate flip rate (how often pass/fail toggles)
    let flips = 0;
    for (let i = 1; i < testResults.length; i++) {
      if (testResults[i].success !== testResults[i - 1].success) {
        flips++;
      }
    }
    const flipRate = flips / (testResults.length - 1);
    allFlipRates.push(flipRate);

    // Collect scores and latencies
    testResults.forEach(r => {
      allScores.push(r.score);
      if (r.latencyMs) {
        allLatencies.push(r.latencyMs);
      }
    });
  }

  // Helper functions for statistics
  const mean = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const stddev = (arr) => {
    if (arr.length === 0) return 0;
    const avg = mean(arr);
    const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
    return Math.sqrt(mean(squareDiffs));
  };
  const percentile = (arr, p) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  // Calculate aggregate metrics
  const metrics = {
    'repeat.pass_n': mean(allPassN),
    'repeat.pass_rate': mean(allPassRates),
    'repeat.flip_rate': mean(allFlipRates),
    'repeat.score.mean': mean(allScores),
    'repeat.score.stddev': stddev(allScores),
    'repeat.score.min': allScores.length > 0 ? Math.min(...allScores) : 0,
    'repeat.score.max': allScores.length > 0 ? Math.max(...allScores) : 1,
  };

  if (allLatencies.length > 0) {
    metrics['repeat.latency.mean'] = mean(allLatencies);
    metrics['repeat.latency.p95'] = percentile(allLatencies, 95);
    metrics['repeat.latency.p99'] = percentile(allLatencies, 99);
  }

  return metrics;
}

module.exports = calculateRepeatStats;
