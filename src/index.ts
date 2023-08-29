import assertions from './assertions';
import providers, { loadApiProvider } from './providers';
import telemetry from './telemetry';
import { evaluate as doEvaluate } from './evaluator';
import { loadApiProviders } from './providers';
import { readTests, writeLatestResults, writeOutput } from './util';
import type { EvaluateOptions, TestSuite, EvaluateTestSuite, TestCase, Assertion } from './types';

export * from './types';

export { generateTable } from './table';

async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  const constructedTestSuite: TestSuite = {
    ...testSuite,
    providers: await loadApiProviders(testSuite.providers, {
      env: testSuite.env,
    }),
    tests: await readTests(testSuite.tests),

    // Full prompts expected (not filepaths)
    prompts: testSuite.prompts.map((promptContent) => ({
      raw: promptContent,
      display: promptContent,
    })),
  };
  telemetry.maybeShowNotice();

  for (const test of constructedTestSuite.tests) {
    if ((test as TestCase).options?.provider) {
      (test as TestCase).options.provider = await loadApiProvider((test as TestCase).options.provider);
    }
    if ((test as TestCase).assert) {
      for (const assertion of (test as TestCase).assert) {
        if ((assertion as Assertion).provider) {
          (assertion as Assertion).provider = await loadApiProvider((assertion as Assertion).provider);
        }
      }
    }
  }

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
