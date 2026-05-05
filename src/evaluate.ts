import * as cache from './cache';
import cliState from './cliState';
import { evaluate as doEvaluate } from './evaluator';
import { getAuthor } from './globalConfig/accounts';
import logger from './logger';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { sanitizeProvider } from './models/evalResult';
import { processPrompts, readProviderPromptMap } from './prompts/index';
import { loadApiProviders, resolveProvider } from './providers/index';
import { createShareableUrl, isSharingEnabled } from './share';
import { isApiProvider } from './types/providers';
import { isTransformFunction } from './types/transform';
import { maybeLoadFromExternalFile } from './util/file';
import { readFilters, writeMultipleOutputs, writeOutput } from './util/index';
import { readTests } from './util/testCaseReader';
import { INLINE_FUNCTION_LABEL, TRANSFORM_KEYS } from './util/transform';

import type {
  EvaluateTestSuite,
  Scenario,
  TestCase,
  TestSuite,
  UnifiedConfig,
} from './types/index';
import type { InternalEvaluateOptions } from './types/internal';
import type { ApiProvider } from './types/providers';

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

function buildProviderMap(providers: ApiProvider[]): Record<string, ApiProvider> {
  const providerMap: Record<string, ApiProvider> = {};
  for (const provider of providers) {
    providerMap[provider.id()] = provider;
    if (provider.label) {
      providerMap[provider.label] = provider;
    }
  }
  return providerMap;
}

async function createRuntimeTestSuite(
  testSuiteConfig: Omit<EvaluateTestSuite, 'author'>,
  loadedProviders: ApiProvider[],
): Promise<TestSuite> {
  const defaultTest =
    typeof testSuiteConfig.defaultTest === 'string' &&
    testSuiteConfig.defaultTest.startsWith('file://')
      ? await maybeLoadFromExternalFile(testSuiteConfig.defaultTest)
      : testSuiteConfig.defaultTest;

  return {
    ...testSuiteConfig,
    defaultTest: defaultTest as TestSuite['defaultTest'],
    scenarios: testSuiteConfig.scenarios as Scenario[],
    providers: loadedProviders,
    tests: await readTests(testSuiteConfig.tests),
    nunjucksFilters: await readFilters(testSuiteConfig.nunjucksFilters || {}),
    prompts: await processPrompts(testSuiteConfig.prompts),
  };
}

async function resolveNestedProviders(
  testSuiteConfig: Omit<EvaluateTestSuite, 'author'>,
  constructedTestSuite: TestSuite,
  providerMap: Record<string, ApiProvider>,
): Promise<void> {
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
}

async function maybeShareEval(
  testSuiteConfig: Omit<EvaluateTestSuite, 'author'>,
  evalResult: Awaited<ReturnType<typeof doEvaluate>>,
): Promise<void> {
  if (!testSuiteConfig.writeLatestResults || !testSuiteConfig.sharing) {
    return;
  }

  if (!isSharingEnabled(evalResult)) {
    logger.debug('Sharing requested but not enabled (check cloud config or sharing settings)');
    return;
  }

  try {
    const shareableUrl = await createShareableUrl(evalResult, { silent: true });
    if (shareableUrl) {
      evalResult.shareableUrl = shareableUrl;
      evalResult.shared = true;
      logger.debug(`Eval shared successfully: ${shareableUrl}`);
    }
  } catch (error) {
    logger.warn(`Failed to create shareable URL: ${error}`);
  }
}

export async function evaluateWithSource(
  testSuite: EvaluateTestSuite,
  options: InternalEvaluateOptions = {},
) {
  const { author: suiteAuthor, ...testSuiteConfig } = testSuite;

  if (testSuiteConfig.writeLatestResults) {
    await runDbMigrations();
  }

  const loadedProviders = await loadApiProviders(testSuiteConfig.providers, {
    env: testSuiteConfig.env,
  });
  const providerMap = buildProviderMap(loadedProviders);
  const constructedTestSuite = await createRuntimeTestSuite(testSuiteConfig, loadedProviders);
  await resolveNestedProviders(testSuiteConfig, constructedTestSuite, providerMap);

  const parsedProviderPromptMap = readProviderPromptMap(
    testSuiteConfig,
    constructedTestSuite.prompts,
  );
  const unifiedConfig = createSerializableUnifiedConfig(
    testSuiteConfig,
    constructedTestSuite.prompts,
  );
  const author = getAuthor(suiteAuthor);
  const evalRecord = testSuiteConfig.writeLatestResults
    ? await Eval.create(unifiedConfig, constructedTestSuite.prompts, { author })
    : new Eval(unifiedConfig, { author });

  const ret = await cache.withCacheEnabled(options.cache === false ? false : undefined, () =>
    doEvaluate(
      {
        ...constructedTestSuite,
        providerPromptMap: parsedProviderPromptMap,
      },
      evalRecord,
      {
        isRedteam: Boolean(testSuiteConfig.redteam),
        ...options,
      },
    ),
  );

  await maybeShareEval(testSuiteConfig, ret);
  if (testSuiteConfig.outputPath) {
    if (typeof testSuiteConfig.outputPath === 'string') {
      await writeOutput(testSuiteConfig.outputPath, evalRecord, null);
    } else if (Array.isArray(testSuiteConfig.outputPath)) {
      await writeMultipleOutputs(testSuiteConfig.outputPath, evalRecord, null);
    }
  }

  return ret;
}
