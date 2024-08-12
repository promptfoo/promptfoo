module.exports = {
  beforeAll: async ({ suite }) => {
    console.log('Starting test suite:', suite.description);
    console.log('Initializing global test resources...');
  },

  afterAll: async ({ suite, results }) => {
    console.log('Test suite completed:', suite.description);
    console.log('Test results:', {
      successes: results.stats.successes,
      failures: results.stats.failures,
    });
    console.log('Cleaning up global test resources...');
  },

  beforeEach: async ({ test, suite }) => {
    console.log('Starting test:', test.description);
    console.log('Setting up test-specific resources...');
  },

  afterEach: async ({ test, result, suite }) => {
    console.log('Finished test:', test.description);
    console.log('Test result:', result.success ? 'Passed' : 'Failed');
    console.log('Cleaning up test-specific resources...');
  },
};
