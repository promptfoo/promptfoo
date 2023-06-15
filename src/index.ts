import assertions from './assertions';
import providers from './providers';
import telemetry from './telemetry';
import { evaluate as doEvaluate } from './evaluator';
import { loadApiProviders } from './providers';
import { readTests } from './util';
import type { EvaluateOptions, TestSuite, TestSuiteConfig } from './types';

export * from './types';

export { generateTable } from './table';

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
  const ret = await doEvaluate(constructedTestSuite, options);
  await telemetry.send();
  return ret;
}

export { evaluate, assertions, providers };

export default {
  evaluate,
  assertions,
  providers,
};
