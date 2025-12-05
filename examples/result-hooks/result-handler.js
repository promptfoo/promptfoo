/**
 * Example extension hook for processing evaluation results.
 *
 * This handler demonstrates common use cases:
 * - Logging evaluation summaries
 * - Alerting on failure thresholds
 * - Sending metrics to monitoring systems
 *
 * Usage:
 *   promptfoo eval -x file://result-handler.js:afterAll
 *
 * Or in promptfooconfig.yaml:
 *   extensions:
 *     - file://result-handler.js:afterAll
 */

module.exports = {
  /**
   * Called after all tests complete.
   * @param {Object} context - The evaluation context
   * @param {string} context.evalId - Unique evaluation ID
   * @param {Object} context.config - Full evaluation configuration
   * @param {Object} context.suite - Test suite configuration
   * @param {Array} context.results - All evaluation results
   * @param {Array} context.prompts - Completed prompts with metrics
   */
  afterAll: async (context) => {
    const { evalId, results, prompts } = context;

    // Calculate statistics
    const total = results.length;
    const passed = results.filter((r) => r.success).length;
    const failed = total - passed;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    // Calculate total cost and latency
    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
    const avgLatency =
      total > 0 ? results.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / total : 0;

    console.log('\n========================================');
    console.log('       EVALUATION RESULTS SUMMARY       ');
    console.log('========================================');
    console.log(`Eval ID:      ${evalId}`);
    console.log(`Total Tests:  ${total}`);
    console.log(`Passed:       ${passed}`);
    console.log(`Failed:       ${failed}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Total Cost:   $${totalCost.toFixed(4)}`);
    console.log(`Avg Latency:  ${avgLatency.toFixed(0)}ms`);
    console.log('========================================\n');

    // Alert on low success rate
    if (successRate < 80) {
      console.warn(`WARNING: Success rate ${successRate}% is below 80% threshold!`);

      // Example: Send to Slack webhook
      // await fetch('https://hooks.slack.com/services/...', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     text: `Evaluation ${evalId} has low success rate: ${successRate}%`
      //   })
      // });
    }

    // Log failures for debugging
    if (failed > 0) {
      console.log('Failed tests:');
      results
        .filter((r) => !r.success)
        .forEach((r, i) => {
          console.log(`  ${i + 1}. ${r.error || 'Assertion failed'}`);
        });
    }

    // Example: Send metrics to monitoring
    // await sendToDatadog({
    //   metric: 'promptfoo.eval.success_rate',
    //   value: successRate,
    //   tags: [`eval_id:${evalId}`]
    // });
  },
};
