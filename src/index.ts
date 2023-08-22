import assertions from './assertions';
import providers from './providers';
import telemetry from './telemetry';
import { evaluate as doEvaluate } from './evaluator';
import { loadApiProviders } from './providers';
import { readTests, writeLatestResults, writeOutput } from './util';
import type { EvaluateOptions, TestSuite, TestSuiteConfig } from './types';

export * from './types';

export { generateTable } from './table';

export interface EvaluateTestSuite extends TestSuiteConfig {
  prompts: string[];
  writeLatestResults?: boolean;
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
  telemetry.maybeShowNotice();

  const ret = await doEvaluate(constructedTestSuite, options);

  if (testSuite.outputPath) {
    writeOutput(testSuite.outputPath, ret, testSuite, null);
  }

  if (testSuite.writeLatestResults) {
    writeLatestResults(ret, testSuite);
  }

  await telemetry.send();
  return ret;
}

export { evaluate, assertions, providers };

export default {
  evaluate,
  assertions,
  providers,
};
