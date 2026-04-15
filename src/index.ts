import assertions from './assertions/index';
import * as cache from './cache';
import cliState from './cliState';
import { evaluate as doEvaluate } from './evaluator';
import { getAuthor } from './globalConfig/accounts';
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
  EvaluateOptions,
  EvaluateTestSuite,
  Scenario,
  TestCase,
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
 * Shallow-clone a test case so the caller can swap in resolved ApiProvider
 * instances on `options.provider` / `assert[].provider` without leaking those
 * mutations back to the input. The input may alias the unified config written
 * to the Eval record, and a live SDK client (e.g. Bedrock's BedrockRuntime,
 * Anthropic's client) holds circular references that break drizzle's JSON
 * serialization on `evalRecord.save()`. Fixes #8687.
 *
 * Detaches only `options` and `assert[]`. Other reference fields (`provider`,
 * `vars`, `metadata`, `providerOutput`) remain aliased — callers must reassign
 * those by reference rather than mutating in place. `assert-set` children are
 * not deep-cloned because the resolve loop skips `assert-set`; if that ever
 * changes, extend this helper.
 */
function cloneTestForResolve<T extends Pick<TestCase, 'options' | 'assert'>>(test: T): T {
  const cloned: T = { ...test };
  if (test.options) {
    cloned.options = { ...test.options };
  }
  if (test.assert) {
    cloned.assert = test.assert.map((assertion) => ({ ...assertion }));
  }
  return cloned;
}

async function evaluate(testSuite: EvaluateTestSuite, options: EvaluateOptions = {}) {
  const { author: suiteAuthor, ...testSuiteConfig } = testSuite;

  if (testSuiteConfig.writeLatestResults) {
    await runDbMigrations();
  }

  const loadedProviders = await loadApiProviders(testSuiteConfig.providers, {
    env: testSuiteConfig.env,
  });
  const providerMap: Record<string, ApiProvider> = {};
  for (const p of loadedProviders) {
    providerMap[p.id()] = p;
    if (p.label) {
      providerMap[p.label] = p;
    }
  }

  // Resolve defaultTest from file reference if needed
  let resolvedDefaultTest = testSuiteConfig.defaultTest;
  if (
    typeof testSuiteConfig.defaultTest === 'string' &&
    testSuiteConfig.defaultTest.startsWith('file://')
  ) {
    resolvedDefaultTest = await maybeLoadFromExternalFile(testSuiteConfig.defaultTest);
  }

  const constructedTestSuite: TestSuite = {
    ...testSuiteConfig,
    defaultTest: resolvedDefaultTest as TestSuite['defaultTest'],
    scenarios: testSuiteConfig.scenarios as Scenario[],
    providers: loadedProviders,
    tests: await readTests(testSuiteConfig.tests),

    nunjucksFilters: await readFilters(testSuiteConfig.nunjucksFilters || {}),

    // Full prompts expected (not filepaths)
    prompts: await processPrompts(testSuiteConfig.prompts),
  };

  // Resolve nested providers. `constructedTestSuite` shallow-shares `defaultTest`
  // and `readTests()` shallow-copies inline test cases, so detach via
  // `cloneTestForResolve()` before mutating — see helper docstring for the why.
  if (typeof constructedTestSuite.defaultTest === 'object' && constructedTestSuite.defaultTest) {
    constructedTestSuite.defaultTest = cloneTestForResolve(constructedTestSuite.defaultTest);

    if (
      constructedTestSuite.defaultTest.provider &&
      !isApiProvider(constructedTestSuite.defaultTest.provider)
    ) {
      constructedTestSuite.defaultTest.provider = await resolveProvider(
        constructedTestSuite.defaultTest.provider,
        providerMap,
        { env: testSuiteConfig.env, basePath: cliState.basePath },
      );
    }
    if (
      constructedTestSuite.defaultTest.options?.provider &&
      !isApiProvider(constructedTestSuite.defaultTest.options.provider)
    ) {
      constructedTestSuite.defaultTest.options.provider = await resolveProvider(
        constructedTestSuite.defaultTest.options.provider,
        providerMap,
        { env: testSuiteConfig.env, basePath: cliState.basePath },
      );
    }
  }

  constructedTestSuite.tests = (constructedTestSuite.tests || []).map(cloneTestForResolve);

  for (const test of constructedTestSuite.tests) {
    if (test.options?.provider && !isApiProvider(test.options.provider)) {
      test.options.provider = await resolveProvider(test.options.provider, providerMap, {
        env: testSuiteConfig.env,
        basePath: cliState.basePath,
      });
    }
    for (const assertion of test.assert || []) {
      if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
        continue;
      }
      if (assertion.provider && !isApiProvider(assertion.provider)) {
        assertion.provider = await resolveProvider(assertion.provider, providerMap, {
          env: testSuiteConfig.env,
          basePath: cliState.basePath,
        });
      }
    }
  }

  // Other settings
  if (options.cache === false) {
    cache.disableCache();
  }

  const parsedProviderPromptMap = readProviderPromptMap(
    testSuiteConfig,
    constructedTestSuite.prompts,
  );
  // INVARIANT: the unified config persisted to the Eval record must not alias any
  // object mutated above with a resolved ApiProvider (see `cloneTestForResolve()`).
  // Live SDK clients hold circular refs and break drizzle JSON serialization on
  // `evalRecord.save()`. Fixes #8687.
  const unifiedConfig = { ...testSuiteConfig, prompts: constructedTestSuite.prompts };
  const author = getAuthor(suiteAuthor);
  const evalRecord = testSuiteConfig.writeLatestResults
    ? await Eval.create(unifiedConfig, constructedTestSuite.prompts, { author })
    : new Eval(unifiedConfig, { author });

  // Run the eval!
  const ret = await doEvaluate(
    {
      ...constructedTestSuite,
      providerPromptMap: parsedProviderPromptMap,
    },
    evalRecord,
    {
      eventSource: 'library',
      isRedteam: Boolean(testSuiteConfig.redteam),
      ...options,
    },
  );

  // Handle sharing if enabled
  if (testSuiteConfig.writeLatestResults && testSuiteConfig.sharing) {
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

  if (testSuiteConfig.outputPath) {
    if (typeof testSuiteConfig.outputPath === 'string') {
      await writeOutput(testSuiteConfig.outputPath, evalRecord, null);
    } else if (Array.isArray(testSuiteConfig.outputPath)) {
      await writeMultipleOutputs(testSuiteConfig.outputPath, evalRecord, null);
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
