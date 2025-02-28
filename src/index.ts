import assertions from './assertions';
import * as cache from './cache';
import { evaluate as doEvaluate } from './evaluator';
import guardrails from './guardrails';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { readProviderPromptMap, processPrompts } from './prompts';
import { loadApiProvider, loadApiProviders } from './providers';
import { extractEntities } from './redteam/extraction/entities';
import { extractSystemPurpose } from './redteam/extraction/purpose';
import { GRADERS } from './redteam/graders';
import { Plugins } from './redteam/plugins';
import { RedteamPluginBase, RedteamGraderBase } from './redteam/plugins/base';
import { Strategies } from './redteam/strategies';
import telemetry from './telemetry';
import type {
  EvaluateOptions,
  TestSuite,
  EvaluateTestSuite,
  ProviderOptions,
  Scenario,
} from './types';
import { readFilters, writeMultipleOutputs, writeOutput } from './util';
import invariant from './util/invariant';
import { readTests } from './util/testCaseReader';

export * from './types';

export { generateTable } from './table';

async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  if (testSuite.writeLatestResults) {
    await runDbMigrations();
  }

  const constructedTestSuite: TestSuite = {
    ...testSuite,
    scenarios: testSuite.scenarios as Scenario[],
    providers: await loadApiProviders(testSuite.providers, {
      env: testSuite.env,
    }),
    tests: await readTests(testSuite.tests),

    nunjucksFilters: await readFilters(testSuite.nunjucksFilters || {}),

    // Full prompts expected (not filepaths)
    prompts: await processPrompts(testSuite.prompts),
  };

  // Resolve nested providers
  if (constructedTestSuite.defaultTest?.options?.provider) {
    if (typeof constructedTestSuite.defaultTest.options.provider === 'function') {
      constructedTestSuite.defaultTest.options.provider = await loadApiProvider(
        constructedTestSuite.defaultTest.options.provider,
      );
    } else if (typeof constructedTestSuite.defaultTest.options.provider === 'object') {
      const casted = constructedTestSuite.defaultTest.options.provider as ProviderOptions;
      invariant(casted.id, 'Provider object must have an id');
      constructedTestSuite.defaultTest.options.provider = await loadApiProvider(casted.id, {
        options: casted,
      });
    }
  }

  for (const test of constructedTestSuite.tests || []) {
    if (test.options?.provider && typeof test.options.provider === 'function') {
      test.options.provider = await loadApiProvider(test.options.provider);
    } else if (test.options?.provider && typeof test.options.provider === 'object') {
      const casted = test.options.provider as ProviderOptions;
      invariant(casted.id, 'Provider object must have an id');
      test.options.provider = await loadApiProvider(casted.id, { options: casted });
    }
    if (test.assert) {
      for (const assertion of test.assert) {
        if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
          continue;
        }

        if (assertion.provider) {
          if (typeof assertion.provider === 'object') {
            const casted = assertion.provider as ProviderOptions;
            invariant(casted.id, 'Provider object must have an id');
            assertion.provider = await loadApiProvider(casted.id, { options: casted });
          } else if (typeof assertion.provider === 'string') {
            assertion.provider = await loadApiProvider(assertion.provider);
          } else {
            throw new Error('Invalid provider type');
          }
        }
      }
    }
  }

  // Other settings
  if (options.cache === false || (options.repeat && options.repeat > 1)) {
    cache.disableCache();
  }

  const parsedProviderPromptMap = readProviderPromptMap(testSuite, constructedTestSuite.prompts);
  const unifiedConfig = { ...testSuite, prompts: constructedTestSuite.prompts };
  const evalRecord = testSuite.writeLatestResults
    ? await Eval.create(unifiedConfig, constructedTestSuite.prompts)
    : new Eval(unifiedConfig);

  // Run the eval!
  const ret = await doEvaluate(
    {
      ...constructedTestSuite,
      providerPromptMap: parsedProviderPromptMap,
    },
    evalRecord,
    {
      eventSource: 'library',
      ...options,
    },
  );

  if (testSuite.outputPath) {
    if (typeof testSuite.outputPath === 'string') {
      await writeOutput(testSuite.outputPath, evalRecord, null);
    } else if (Array.isArray(testSuite.outputPath)) {
      await writeMultipleOutputs(testSuite.outputPath, evalRecord, null);
    }
  }

  await telemetry.send();
  return ret;
}

const redteam = {
  Extractors: {
    extractEntities,
    extractSystemPurpose,
  },
  Graders: GRADERS,
  Plugins,
  Strategies,
  Base: {
    Plugin: RedteamPluginBase,
    Grader: RedteamGraderBase,
  },
};

export { assertions, cache, evaluate, loadApiProvider, redteam, guardrails };

export default {
  assertions,
  cache,
  evaluate,
  loadApiProvider,
  redteam,
  guardrails,
};
