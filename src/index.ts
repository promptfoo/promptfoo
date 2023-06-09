import { evaluate as doEvaluate } from './evaluator';
import { loadApiProviders } from './providers';
import assertions from './assertions';
import providers from './providers';

import type { EvaluateOptions, TestSuite, TestSuiteConfig } from './types';
import { readTests } from './util';

export * from './types';

interface EvaluateTestSuite extends TestSuiteConfig {
  prompts: string[];
}

async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  const constructedTestSuite: TestSuite = {
    ...testSuite,
    providers: await loadApiProviders(testSuite.providers),
    tests: await readTests(testSuite.tests),

    // Full prompts expected (not filepaths)
    prompts: testSuite.prompts.map((promptContent) => ({
      raw: promptContent,
      display: promptContent,
    })),
  };
  return doEvaluate(constructedTestSuite, options);
}

module.exports = {
  evaluate,
  assertions,
  providers,
};

export default {
  evaluate,
  assertions,
  providers,
};
