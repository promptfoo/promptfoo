import { evaluate as doEvaluate } from './evaluator.js';
import { loadApiProviders } from './providers.js';
import assertions from './assertions.js';
import providers from './providers.js';

import type { EvaluateOptions, TestSuite, TestSuiteConfig } from './types.js';
import { readTests } from './util.js';

export * from './types.js';

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
