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
import type { ApiProvider } from './types/providers';
import { readFilters, writeMultipleOutputs, writeOutput } from './util';
import invariant from './util/invariant';
import { readTests } from './util/testCaseReader';

export * from './types';

export { generateTable } from './table';

/**
 * Interface for loadApiProvider options that includes both required and optional properties
 */
interface LoadApiProviderOptions {
  options?: ProviderOptions;
  env?: any;
}

/**
 * Helper function to resolve provider from various formats (string, object, function)
 * Uses providerMap for optimization and falls back to loadApiProvider with proper context
 */
async function resolveProvider(
  provider: any,
  providerMap: Record<string, ApiProvider>,
  context: { env?: any } = {}
): Promise<ApiProvider> {
  // Guard clause for null or undefined provider values
  if (provider == null) {
    throw new Error('Provider cannot be null or undefined');
  }

  if (typeof provider === 'string') {
    // Check providerMap first for optimization, then fall back to loadApiProvider with context
    if (providerMap[provider]) {
      return providerMap[provider];
    }
    return context.env ? await loadApiProvider(provider, { env: context.env }) : await loadApiProvider(provider);
  } else if (typeof provider === 'object') {
    const casted = provider as ProviderOptions;
    invariant(casted.id, 'Provider object must have an id');
    const loadOptions: LoadApiProviderOptions = { options: casted };
    if (context.env) {
      loadOptions.env = context.env;
    }
    return await loadApiProvider(casted.id, loadOptions);
  } else if (typeof provider === 'function') {
    return context.env ? await loadApiProvider(provider, { env: context.env }) : await loadApiProvider(provider);
  } else {
    throw new Error('Invalid provider type');
  }
}

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

  const constructedTestSuite: TestSuite = {
    ...testSuite,
    scenarios: testSuite.scenarios as Scenario[],
    providers: loadedProviders,
    tests: await readTests(testSuite.tests),

    nunjucksFilters: await readFilters(testSuite.nunjucksFilters || {}),

    // Full prompts expected (not filepaths)
    prompts: await processPrompts(testSuite.prompts),
  };

  // Resolve nested providers
  if (constructedTestSuite.defaultTest?.options?.provider) {
    constructedTestSuite.defaultTest.options.provider = await resolveProvider(
      constructedTestSuite.defaultTest.options.provider,
      providerMap,
      { env: testSuite.env }
    );
  }

  for (const test of constructedTestSuite.tests || []) {
    if (test.options?.provider) {
      test.options.provider = await resolveProvider(
        test.options.provider,
        providerMap,
        { env: testSuite.env }
      );
    }
    if (test.assert) {
      for (const assertion of test.assert) {
        if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
          continue;
        }

        if (assertion.provider) {
          assertion.provider = await resolveProvider(
            assertion.provider,
            providerMap,
            { env: testSuite.env }
          );
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
