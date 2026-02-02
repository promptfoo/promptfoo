import assertions from './assertions/index';
import * as cache from './cache';
import cliState from './cliState';
import { evaluate as doEvaluate } from './evaluator';
import guardrails from './guardrails';
import logger from './logger';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { processPrompts, readProviderPromptMap } from './prompts/index';
import { loadApiProvider, loadApiProviders, resolveProvider } from './providers/index';
import { doGenerateRedteam } from './redteam/commands/generate';
import { extractEntities } from './redteam/extraction/entities';
import { extractMcpToolsInfo } from './redteam/extraction/mcpTools';
import { extractSystemPurpose } from './redteam/extraction/purpose';
import { GRADERS } from './redteam/graders';
import { RedteamGraderBase, RedteamPluginBase } from './redteam/plugins/base';
import { Plugins } from './redteam/plugins/index';
import { doRedteamRun } from './redteam/shared';
import { Strategies } from './redteam/strategies/index';
import { createShareableUrl, isSharingEnabled } from './share';
import { isApiProvider } from './types/providers';
import { maybeLoadFromExternalFile } from './util/file';
import { readFilters, writeMultipleOutputs, writeOutput } from './util/index';
import { readTests } from './util/testCaseReader';

import type {
  Assertion,
  AssertionSet,
  CombinatorAssertion,
  EvaluateOptions,
  EvaluateTestSuite,
  Scenario,
  TestSuite,
} from './types/index';
import type { ApiProvider } from './types/providers';

export { generateTable } from './table';
export * from './types/index';

// Extension hook context types for users writing custom extensions
export type {
  AfterAllExtensionHookContext,
  AfterEachExtensionHookContext,
  BeforeAllExtensionHookContext,
  BeforeEachExtensionHookContext,
  ExtensionHookContextMap,
} from './evaluatorHelpers';

/**
 * Recursively resolves provider strings to ApiProvider instances within assertions,
 * including nested assertions inside combinators (and/or) and assert-sets.
 */
async function resolveAssertionProviders(
  assertions: Array<Assertion | AssertionSet | CombinatorAssertion>,
  providerMap: Record<string, ApiProvider>,
  context: { env?: Record<string, string>; basePath?: string },
): Promise<void> {
  for (const assertion of assertions) {
    // Handle combinator assertions (and/or)
    if (assertion.type === 'and' || assertion.type === 'or') {
      const combinator = assertion as CombinatorAssertion;
      if (combinator.assert) {
        await resolveAssertionProviders(combinator.assert, providerMap, context);
      }
      continue;
    }

    // Handle assert-sets
    if (assertion.type === 'assert-set') {
      const assertSet = assertion as AssertionSet;
      if (assertSet.assert) {
        await resolveAssertionProviders(assertSet.assert, providerMap, context);
      }
      continue;
    }

    // Handle regular assertions
    const regularAssertion = assertion as Assertion;
    if (typeof regularAssertion.provider === 'function') {
      continue;
    }

    if (regularAssertion.provider && !isApiProvider(regularAssertion.provider)) {
      regularAssertion.provider = await resolveProvider(regularAssertion.provider, providerMap, {
        env: context.env,
        basePath: context.basePath,
      });
    }
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
  if (typeof constructedTestSuite.defaultTest === 'object') {
    // Resolve defaultTest.provider (only if it's not already an ApiProvider instance)
    if (
      constructedTestSuite.defaultTest?.provider &&
      !isApiProvider(constructedTestSuite.defaultTest.provider)
    ) {
      constructedTestSuite.defaultTest.provider = await resolveProvider(
        constructedTestSuite.defaultTest.provider,
        providerMap,
        { env: testSuite.env, basePath: cliState.basePath },
      );
    }
    // Resolve defaultTest.options.provider (only if it's not already an ApiProvider instance)
    if (
      constructedTestSuite.defaultTest?.options?.provider &&
      !isApiProvider(constructedTestSuite.defaultTest.options.provider)
    ) {
      constructedTestSuite.defaultTest.options.provider = await resolveProvider(
        constructedTestSuite.defaultTest.options.provider,
        providerMap,
        { env: testSuite.env, basePath: cliState.basePath },
      );
    }
    // Resolve providers in defaultTest.assert (including nested combinators/assert-sets)
    if (constructedTestSuite.defaultTest?.assert) {
      await resolveAssertionProviders(constructedTestSuite.defaultTest.assert, providerMap, {
        env: testSuite.env,
        basePath: cliState.basePath,
      });
    }
  }

  for (const test of constructedTestSuite.tests || []) {
    if (test.options?.provider && !isApiProvider(test.options.provider)) {
      test.options.provider = await resolveProvider(test.options.provider, providerMap, {
        env: testSuite.env,
        basePath: cliState.basePath,
      });
    }
    if (test.assert) {
      // Recursively resolve providers in all assertions, including nested ones
      await resolveAssertionProviders(test.assert, providerMap, {
        env: testSuite.env,
        basePath: cliState.basePath,
      });
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

  // Handle sharing if enabled
  if (testSuite.writeLatestResults && testSuite.sharing) {
    if (isSharingEnabled(ret)) {
      try {
        const shareableUrl = await createShareableUrl(ret, { silent: true });
        if (shareableUrl) {
          ret.shareableUrl = shareableUrl;
          ret.shared = true;
          logger.debug(`Eval shared successfully: ${shareableUrl}`);
        }
      } catch (error) {
        // Don't fail the evaluation if sharing fails
        logger.warn(`Failed to create shareable URL: ${error}`);
      }
    } else {
      logger.debug('Sharing requested but not enabled (check cloud config or sharing settings)');
    }
  }

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
