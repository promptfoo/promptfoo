async function extensionHook(hookName, context) {
  if (hookName === 'beforeAll') {
    console.log('Starting test suite:', context.suite.description);
    console.log('Initializing global test resources...');
  } else if (hookName === 'afterAll') {
    console.log('Test suite completed:', context.suite.description);
    console.log('Test results:', {
      successes: context.results.stats.successes,
      failures: context.results.stats.failures,
    });
    console.log('Cleaning up global test resources...');
  } else if (hookName === 'beforeEach') {
    console.log('Starting test:', context.test.description);
    console.log('Setting up test-specific resources...');
  } else if (hookName === 'afterEach') {
    console.log('Finished test:', context.test.description);
    console.log('Test result:', context.result.success ? 'Passed' : 'Failed');
    console.log('Cleaning up test-specific resources...');
  }
}

module.exports = extensionHook;
