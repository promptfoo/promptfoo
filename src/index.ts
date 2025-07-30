import assertions from './assertions';
import * as cache from './cache';
import { evaluate as doEvaluate } from './evaluator';
import guardrails from './guardrails';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { processPrompts, readProviderPromptMap } from './prompts';
import { loadApiProvider, loadApiProviders, resolveProvider } from './providers';
import { doGenerateRedteam } from './redteam/commands/generate';
import { extractEntities } from './redteam/extraction/entities';
import { extractMcpToolsInfo } from './redteam/extraction/mcpTools';
import { extractSystemPurpose } from './redteam/extraction/purpose';
import { GRADERS } from './redteam/graders';
import { Plugins } from './redteam/plugins';
import { RedteamGraderBase, RedteamPluginBase } from './redteam/plugins/base';
import { doRedteamRun } from './redteam/shared';
import { Strategies } from './redteam/strategies';
import { readFilters, writeMultipleOutputs, writeOutput } from './util';
import { maybeLoadFromExternalFile } from './util/file';
import { readTests } from './util/testCaseReader';

import type { EvaluateOptions, EvaluateTestSuite, Scenario, TestSuite } from './types';
import type { ApiProvider } from './types/providers';

export { generateTable } from './table';
export * from './types';

async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  if (testSuite.writeLatestResults) {
    await runDbMigrations();
  }

  const loadedProviders = await loadApiProviders(testSuite.providers, {
    env: testSuite.env,
  });
  const providerMap: Record<string, ApiProvider> = {};
  for (const p of loadedProviders) {
    providerMap[p.id()] = p;
    if (p.label) {
      providerMap[p.label] = p;
    }
  }

  // Resolve defaultTest from file reference if needed
  let resolvedDefaultTest = testSuite.defaultTest;
  if (typeof testSuite.defaultTest === 'string' && testSuite.defaultTest.startsWith('file://')) {
    resolvedDefaultTest = await maybeLoadFromExternalFile(testSuite.defaultTest);
  }

  const constructedTestSuite: TestSuite = {
    ...testSuite,
    defaultTest: resolvedDefaultTest as TestSuite['defaultTest'],
    scenarios: testSuite.scenarios as Scenario[],
    providers: loadedProviders,
    tests: await readTests(testSuite.tests),

    nunjucksFilters: await readFilters(testSuite.nunjucksFilters || {}),

    // Full prompts expected (not filepaths)
    prompts: await processPrompts(testSuite.prompts),
  };

  // Resolve nested providers
  if (
    typeof constructedTestSuite.defaultTest === 'object' &&
    constructedTestSuite.defaultTest?.options?.provider
  ) {
    constructedTestSuite.defaultTest.options.provider = await resolveProvider(
      constructedTestSuite.defaultTest.options.provider,
      providerMap,
      { env: testSuite.env },
    );
  }

  for (const test of constructedTestSuite.tests || []) {
    if (test.options?.provider) {
      test.options.provider = await resolveProvider(test.options.provider, providerMap, {
        env: testSuite.env,
      });
    }
    if (test.assert) {
      for (const assertion of test.assert) {
        if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
          continue;
        }

        if (assertion.provider) {
          assertion.provider = await resolveProvider(assertion.provider, providerMap, {
            env: testSuite.env,
          });
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
      isRedteam: Boolean(testSuite.redteam),
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

  return ret;
}

const redteam = {
  Extractors: {
    extractEntities,
    extractMcpToolsInfo,
    extractSystemPurpose,
  },
  Graders: GRADERS,
  Plugins,
  Strategies,
  Base: {
    Plugin: RedteamPluginBase,
    Grader: RedteamGraderBase,
  },
  generate: doGenerateRedteam,
  run: doRedteamRun,
};

export { assertions, cache, evaluate, guardrails, loadApiProvider, redteam };

export default {
  assertions,
  cache,
  evaluate,
  guardrails,
  loadApiProvider,
  redteam,
};
