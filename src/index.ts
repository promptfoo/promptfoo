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
    prompts: testSuite.prompts, // raw prompts expected
    providers: await loadApiProviders(testSuite.providers),
    tests: await readTests(testSuite.tests),
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
