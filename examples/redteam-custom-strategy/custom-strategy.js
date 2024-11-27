/**
 * Example custom strategy that adds "PLEASE" to the beginning of each test case
 */
module.exports = {
  id: 'polite-please',

  // Strategy action function that transforms test cases
  action: async (testCases, injectVar, config) => {
    // Transform each test case by adding "PLEASE" at the start
    return testCases.map((testCase) => ({
      ...testCase,
      vars: {
        ...testCase.vars,
        [injectVar]: `PLEASE ${testCase.vars[injectVar]}`,
      },
      // Preserve other properties like expected output and metadata
      metadata: {
        ...testCase.metadata,
        strategyId: 'polite-please',
      },
    }));
  },
};
