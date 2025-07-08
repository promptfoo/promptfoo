/**
 * Example output handler for promptfoo evaluation results
 * This handler receives the evaluation results and can process them
 * for custom reporting, alerting, or integration with other systems.
 */

module.exports = async function handleEvaluationResults(data) {
  console.log('\n=== Evaluation Results Handler ===');
  console.log(`Eval ID: ${data.evalId}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const { stats } = data.results;
  const successRate = ((stats.successes / stats.total) * 100).toFixed(2);

  console.log(`\nOverall Results: ${stats.successes}/${stats.total} passed (${successRate}%)`);
  console.log(`Failures: ${stats.failures}`);
  console.log(`Tokens used: ${stats.tokenUsage.total}`);

  // Check for failures and log them
  if (stats.failures > 0) {
    console.log('\n⚠️  Failures detected:');

    data.results.results.forEach((result, idx) => {
      if (!result.success) {
        console.log(`\n  Test ${idx + 1}:`);
        console.log(`    Prompt: ${result.prompt.raw}`);
        console.log(`    Variables: ${JSON.stringify(result.vars)}`);
        console.log(`    Reason: ${result.error || 'Assertion failed'}`);
      }
    });
  }

  // Example: Send metrics to monitoring system
  // await sendToMonitoring({
  //   metric: 'promptfoo.eval.success_rate',
  //   value: successRate,
  //   tags: { evalId: data.evalId }
  // });

  // Example: Trigger alerts for low success rates
  if (successRate < 80) {
    console.log(`\n🚨 Alert: Success rate below 80% threshold!`);
    // await sendAlert(`Evaluation ${data.evalId} has low success rate: ${successRate}%`);
  }

  // Example: Save summary to database
  const summary = {
    evalId: data.evalId,
    timestamp: new Date().toISOString(),
    successRate: Number.parseFloat(successRate),
    totalTests: stats.total,
    failures: stats.failures,
    tokenUsage: stats.tokenUsage.total,
  };

  console.log('\n📊 Summary:', JSON.stringify(summary, null, 2));

  // Return value is optional but can be used for chaining
  return summary;
};
