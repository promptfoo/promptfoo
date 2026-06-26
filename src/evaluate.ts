import * as cache from './cache';
import cliState from './cliState';
import { evaluate as doEvaluate } from './evaluator';
import { getAuthor } from './globalConfig/accounts';
import logger from './logger';
import { runDbMigrations } from './migrate';
import Eval from './models/eval';
import { processPrompts, readProviderPromptMap } from './prompts/index';
import { loadApiProviders, resolveProvider } from './providers/index';
import { createShareableUrl, isSharingEnabled } from './share';
import { isApiProvider } from './types/providers';
import { createSerializableUnifiedConfig } from './util/config/persistableScenario';
import {
  getScenarioSourceContext,
  transferScenarioSourceContext,
} from './util/config/scenarioContext';
import { expandScenarioConfigValues, loadScenarioConfigs } from './util/config/scenarioMatrix';
import { maybeLoadFromExternalFile } from './util/file';
import {
  buildConfiguredProviderMap,
  isProviderTypeMap,
  resolveConfiguredProviderReference,
} from './util/gradingProvider';
import { readFilters, warnOnDegradedJsonlRecovery, writeMultipleOutputs } from './util/index';
import { readScenarioTests, readTests } from './util/testCaseReader';

import type {
  EnvOverrides,
  EvaluateTestSuite,
  GradingConfig,
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

async function resolveGradingProvider(
  provider: GradingConfig['provider'],
  providerMap: Record<string, ApiProvider>,
  context: { env?: EnvOverrides; basePath?: string },
): Promise<GradingConfig['provider']> {
  if (!isProviderTypeMap(provider)) {
    return isApiProvider(provider) ? provider : resolveProvider(provider, providerMap, context);
  }

  // A typed map can carry alternatives for assertion types that never run.
  // Reuse configured provider instances, but leave all other entries for
  // getGradingProvider() to instantiate only when its type is selected.
  return resolveConfiguredProviderReference(provider, providerMap, context.env);
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

  const scenarioEnv = testSuiteConfig.env ?? {};
  const loadedScenarios = await loadScenarioConfigs(
    testSuiteConfig.scenarios,
    process.cwd(),
    scenarioEnv,
  );
  const scenarios = loadedScenarios
    ? await Promise.all(
        loadedScenarios.map(async (scenario) => {
          const sourceContext = getScenarioSourceContext(scenario) ?? {
            basePath: process.cwd(),
            envOverrides: scenarioEnv,
          };
          const scenarioTests = await readScenarioTests(
            (scenario as { tests?: unknown }).tests,
            sourceContext.basePath,
            sourceContext.envOverrides,
          );
          return transferScenarioSourceContext(scenario, {
            ...scenario,
            ...(scenarioTests === undefined ? {} : { tests: scenarioTests }),
            config: await expandScenarioConfigValues(
              scenario.config,
              sourceContext.basePath,
              sourceContext.envOverrides,
            ),
          });
        }),
      )
    : undefined;

  return {
    ...testSuiteConfig,
    defaultTest: defaultTest as TestSuite['defaultTest'],
    scenarios: scenarios as TestSuite['scenarios'],
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
      constructedTestSuite.defaultTest.options.provider = await resolveGradingProvider(
        constructedTestSuite.defaultTest.options.provider,
        providerMap,
        { env: testSuiteConfig.env, basePath: cliState.basePath },
      );
    }
  }

  constructedTestSuite.tests = (constructedTestSuite.tests || []).map(cloneTestForResolve);

  for (const test of constructedTestSuite.tests) {
    if (test.options?.provider && !isApiProvider(test.options.provider)) {
      test.options.provider = await resolveGradingProvider(test.options.provider, providerMap, {
        env: testSuiteConfig.env,
        basePath: cliState.basePath,
      });
    }
    for (const assertion of test.assert || []) {
      if (assertion.type === 'assert-set' || typeof assertion.provider === 'function') {
        continue;
      }
      if (assertion.provider && !isApiProvider(assertion.provider)) {
        assertion.provider = await resolveGradingProvider(assertion.provider, providerMap, {
          env: testSuiteConfig.env,
          basePath: cliState.basePath,
        });
      }
    }
  }
}

async function maybeShareEval(
  testSuiteConfig: Omit<EvaluateTestSuite, 'author'>,
  evalResult: Eval,
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
  const providerMap = buildConfiguredProviderMap(loadedProviders);
  const constructedTestSuite = await createRuntimeTestSuite(testSuiteConfig, loadedProviders);
  await resolveNestedProviders(testSuiteConfig, constructedTestSuite, providerMap);

  const parsedProviderPromptMap = readProviderPromptMap(
    testSuiteConfig,
    constructedTestSuite.prompts,
  );
  // Persist expanded scenario rows (matching CLI behavior) so re-runs and retries
  // do not re-resolve relative $values refs against a different cwd.
  const unifiedConfig = createSerializableUnifiedConfig(
    { ...testSuiteConfig, scenarios: constructedTestSuite.scenarios },
    constructedTestSuite.prompts,
    () =>
      logger.warn(
        'Function-valued transform(s) in testSuite were replaced with "[inline function]" markers in the persisted config. Re-running the saved eval will not invoke them; use string expressions or file:// references if you need the config to round-trip.',
      ),
  ) as Partial<UnifiedConfig>;
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
    const outputPaths =
      typeof testSuiteConfig.outputPath === 'string'
        ? [testSuiteConfig.outputPath]
        : testSuiteConfig.outputPath;
    warnOnDegradedJsonlRecovery(evalRecord, outputPaths);
    // writeMultipleOutputs maps each path through writeOutput, so it covers the single-path
    // case too — matching the doEval call site in src/node/doEval.ts.
    if (outputPaths.length) {
      await writeMultipleOutputs(outputPaths, evalRecord, null);
    }
  }

  return ret;
}
