let counter = 0;
async function extensionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    console.log(`Setting up test suite: ${context.suite.description || 'Unnamed suite'}`);
    console.log(`Total prompts: ${context.suite.prompts?.length || 0}`);
    console.log(`Total providers: ${context.suite.providers?.length || 0}`);
    console.log(`Total tests: ${context.suite.tests?.length || 0}`);
  } else if (hookName === 'beforeEach') {
    console.log(`Preparing test`);
  } else if (hookName === 'afterEach') {
    console.log(
      `Completed test ${counter++}${context.result ? `, Result: ${context.result.success ? 'Pass' : 'Fail'}, Score: ${context.result.score}` : ''}`,
    );
  } else if (hookName === 'afterAll') {
    console.log('Test suite completed');
    console.log(`Total tests run: ${context.results?.length || 0}`);

    const successes = context.results?.filter((r) => r.success).length || 0;
    const failures = context.results?.filter((r) => !r.success).length || 0;
    console.log(`Successes: ${successes}`);
    console.log(`Failures: ${failures}`);

    const totalTokenUsage =
      context.results?.reduce((sum, r) => sum + (r.response?.tokenUsage?.total || 0), 0) || 0;
    console.log(`Total token usage: ${totalTokenUsage}`);
    
    console.log('\n----- SYNTHETIC METRICS DEMO -----');
    
    const providerResults = {};
    context.results?.forEach(result => {
      const providerId = result.provider?.id || 'unknown';
      if (!providerResults[providerId]) {
        providerResults[providerId] = [];
      }
      providerResults[providerId].push(result);
    });
    
    const providerScores = {};
    for (const [providerId, results] of Object.entries(providerResults)) {
      const totalScore = results.reduce((sum, r) => sum + r.score, 0);
      const avgScore = totalScore / results.length;
      providerScores[providerId] = {
        avgScore,
        totalTests: results.length,
        passRate: (results.filter(r => r.success).length / results.length) * 100
      };
    }
    
    console.log('Provider Performance Summary:');
    for (const [providerId, metrics] of Object.entries(providerScores)) {
      console.log(`  ${providerId}:`);
      console.log(`    Average Score: ${metrics.avgScore.toFixed(2)}`);
      console.log(`    Pass Rate: ${metrics.passRate.toFixed(2)}%`);
      console.log(`    Total Tests: ${metrics.totalTests}`);
    }
    
    console.log('\nThis data could be used to create a synthetic provider by adding:');
    console.log('  context.prompts.push({');
    console.log('    provider: "synthetic-metrics",');
    console.log('    metrics: {');
    console.log('      providerPerformance: providerScores');
    console.log('    }');
    console.log('  });');
    console.log('----- END DEMO -----');
  }
}

module.exports = extensionHook;
