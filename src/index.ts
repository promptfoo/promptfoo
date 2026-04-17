import assertions from './assertions/index';
import * as cache from './cache';
import cliState from './cliState';
import { evaluate as doEvaluate } from './evaluator';
import guardrails from './guardrails';
import logger from './logger';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { sanitizeProvider } from './models/evalResult';
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
import { isTransformFunction } from './types/transform';
import { maybeLoadFromExternalFile } from './util/file';
import { readFilters, writeMultipleOutputs, writeOutput } from './util/index';
import { readTests } from './util/testCaseReader';
import { INLINE_FUNCTION_LABEL, TRANSFORM_KEYS } from './util/transform';

import type {
  EvaluateOptions,
  EvaluateTestSuite,
  Scenario,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types/index';
import type { ApiProvider } from './types/providers';

export { generateTable } from './table';
export * from './types/index';
// Transform types and runtime guard for users passing inline transform functions
// via the Node.js package.
export { isTransformFunction } from './types/transform';

// Extension hook context types for users writing custom extensions
export type {
  AfterAllExtensionHookContext,
  AfterEachExtensionHookContext,
  BeforeAllExtensionHookContext,
  BeforeEachExtensionHookContext,
  ExtensionHookContextMap,
} from './evaluatorHelpers';
export type { TransformContext, TransformFunction, TransformPrompt } from './types/transform';

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

function toSerializableProviderRef(provider: unknown): unknown {
  if (isApiProvider(provider)) {
    return sanitizeProvider(provider);
  }
  if (Array.isArray(provider)) {
    return provider.map(toSerializableProviderRef);
  }
  return provider;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function withSerializableProvider<T extends Record<string, unknown>>(record: T): T {
  if (!isApiProvider(record.provider)) {
    return record;
  }
  return {
    ...record,
    provider: sanitizeProvider(record.provider),
  };
}

/**
 * Function-valued transforms are first-class at runtime but are silently dropped
 * by `JSON.stringify`. Persisted eval configs (drizzle-stored) must never retain
 * a function reference, so replace every `transform`-like field with a
 * `[inline function]: name` marker. Non-function values pass through unchanged.
 *
 * `droppedRef.value` is flipped to `true` the first time a function is replaced
 * so the caller can emit a single warning instead of logging per field.
 */
function replaceFunctionTransforms<T extends Record<string, unknown>>(
  record: T,
  droppedRef: { value: boolean },
): T {
  let result: T | undefined;
  for (const key of TRANSFORM_KEYS) {
    const value = record[key];
    if (!isTransformFunction(value)) {
      continue;
    }
    if (!result) {
      result = { ...record };
    }
    (result as Record<string, unknown>)[key] = value.name
      ? `${INLINE_FUNCTION_LABEL}: ${value.name}`
      : INLINE_FUNCTION_LABEL;
    droppedRef.value = true;
  }
  return result ?? record;
}

function toSerializableAssertion(assertion: unknown, droppedRef: { value: boolean }): unknown {
  if (!isRecord(assertion)) {
    return assertion;
  }

  let sanitizedAssertion = withSerializableProvider(assertion);
  sanitizedAssertion = replaceFunctionTransforms(sanitizedAssertion, droppedRef);

  if (Array.isArray(assertion.assert)) {
    sanitizedAssertion = {
      ...sanitizedAssertion,
      assert: assertion.assert.map((a) => toSerializableAssertion(a, droppedRef)),
    };
  }

  return sanitizedAssertion;
}

function toSerializableTestCase(test: unknown, droppedRef: { value: boolean }): unknown {
  if (!isRecord(test)) {
    return test;
  }

  let sanitizedTest = withSerializableProvider(test);

  if (isRecord(test.options)) {
    let options = withSerializableProvider(test.options);
    options = replaceFunctionTransforms(options, droppedRef);
    if (options !== test.options) {
      sanitizedTest = {
        ...sanitizedTest,
        options,
      };
    }
  }

  if (Array.isArray(test.assert)) {
    sanitizedTest = {
      ...sanitizedTest,
      assert: test.assert.map((a) => toSerializableAssertion(a, droppedRef)),
    };
  }

  return sanitizedTest;
}

function toSerializableScenario(scenario: unknown, droppedRef: { value: boolean }): unknown {
  if (!isRecord(scenario)) {
    return scenario;
  }

  if (!Array.isArray(scenario.tests)) {
    return scenario;
  }

  return {
    ...scenario,
    tests: scenario.tests.map((t) => toSerializableTestCase(t, droppedRef)),
  };
}

function createSerializableUnifiedConfig(
  testSuite: EvaluateTestSuite,
  prompts: TestSuite['prompts'],
): Partial<UnifiedConfig> {
  const droppedRef = { value: false };
  const config = {
    ...testSuite,
    providers: toSerializableProviderRef(testSuite.providers),
    defaultTest: toSerializableTestCase(testSuite.defaultTest, droppedRef),
    tests: Array.isArray(testSuite.tests)
      ? testSuite.tests.map((t) => toSerializableTestCase(t, droppedRef))
      : testSuite.tests,
    scenarios: Array.isArray(testSuite.scenarios)
      ? testSuite.scenarios.map((s) => toSerializableScenario(s, droppedRef))
      : testSuite.scenarios,
    prompts,
  } as Partial<UnifiedConfig>;

  if (droppedRef.value && testSuite.writeLatestResults) {
    logger.warn(
      'Function-valued transform(s) in testSuite were replaced with "[inline function]" markers in the persisted config. Re-running the saved eval will not invoke them; use string expressions or file:// references if you need the config to round-trip.',
    );
  }

  return config;
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
        { env: testSuite.env, basePath: cliState.basePath },
      );
    }
    if (
      constructedTestSuite.defaultTest.options?.provider &&
      !isApiProvider(constructedTestSuite.defaultTest.options.provider)
    ) {
      constructedTestSuite.defaultTest.options.provider = await resolveProvider(
        constructedTestSuite.defaultTest.options.provider,
        providerMap,
        { env: testSuite.env, basePath: cliState.basePath },
      );
    }
  }

  constructedTestSuite.tests = (constructedTestSuite.tests || []).map(cloneTestForResolve);

  for (const test of constructedTestSuite.tests) {
    if (test.options?.provider && !isApiProvider(test.options.provider)) {
      test.options.provider = await resolveProvider(test.options.provider, providerMap, {
        env: testSuite.env,
        basePath: cliState.basePath,
      });
    }
    for (const assertion of test.assert || []) {
      if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
        continue;
      }
      if (assertion.provider && !isApiProvider(assertion.provider)) {
        assertion.provider = await resolveProvider(assertion.provider, providerMap, {
          env: testSuite.env,
          basePath: cliState.basePath,
        });
      }
    }
  }

  // Other settings
  if (options.cache === false) {
    cache.disableCache();
  }

  const parsedProviderPromptMap = readProviderPromptMap(testSuite, constructedTestSuite.prompts);
  // INVARIANT: the unified config persisted to the Eval record must not alias any
  // object mutated above with a resolved ApiProvider (see `cloneTestForResolve()`).
  // Live SDK clients hold circular refs and break drizzle JSON serialization on
  // `evalRecord.save()`. Fixes #8687.
  const unifiedConfig = createSerializableUnifiedConfig(testSuite, constructedTestSuite.prompts);
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
