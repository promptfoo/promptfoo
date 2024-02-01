import { TestCase, TestSuite } from './types';

export function addTestsFromScenarios(testSuite: TestSuite): TestSuite {
  let tests = testSuite.tests || [];
  if (testSuite.scenarios && testSuite.scenarios.length > 0) {
    for (const scenario of testSuite.scenarios) {
      for (const data of scenario.config) {
        // Merge defaultTest with scenario config
        const scenarioTests = (
          scenario.tests || [
            {
              // Dummy test for cases when we're only comparing raw prompts.
            },
          ]
        ).map((test) => {
          return {
            ...testSuite.defaultTest,
            ...data,
            ...test,
            vars: {
              ...testSuite.defaultTest?.vars,
              ...data.vars,
              ...test.vars,
            },
            options: {
              ...testSuite.defaultTest?.options,
              ...test.options,
            },
          };
        });
        // Add scenario tests to tests
        tests = tests.concat(scenarioTests);
      }
    }
  }
  testSuite.tests = tests;
  return testSuite;
}
