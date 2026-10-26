import deepEqual from 'fast-deep-equal';
import logger from '../../logger';
import Eval from '../../models/eval';
import { deduplicateTestCases, extractRuntimeVars, filterRuntimeVars } from '../../util/comparison';
import { readOutput, resultIsForTestCase } from '../../util/index';
import { providerToIdentifier } from '../provider';

import type { EvaluateResult, Scenario, TestCase, TestSuite } from '../../types/index';

type Tests = NonNullable<TestSuite['tests']>;

/**
 * Predicate function for filtering test results
 */
type ResultFilterFn = (result: EvaluateResult) => boolean;
type TestFilterFn = (test: TestCase) => boolean;

export interface ResultMatchContext {
  includesResult: (result: EvaluateResult) => boolean;
  matchesTest: (result: EvaluateResult, test: TestCase) => boolean;
  resultLoadCache?: Map<string, Promise<EvaluateResult[] | undefined>>;
}

async function loadStoredResults(pathOrId: string): Promise<EvaluateResult[] | undefined> {
  try {
    if (pathOrId.endsWith('.json')) {
      const output = await readOutput(pathOrId);
      return output.results.results;
    }

    const eval_ = await Eval.findById(pathOrId);
    if (!eval_) {
      logger.warn(`[filterTestsByResults] Evaluation not found: ${pathOrId}`);
      return undefined;
    }
    const summary = await eval_.toEvaluateSummary();
    if ('results' in summary) {
      return summary.results;
    }
    logger.debug('[filterTestsByResults] No results in evaluation summary');
  } catch (error) {
    logger.warn(`[filterTestsByResults] Error loading results: ${error}`);
  }
  return undefined;
}

/**
 * Merges defaultTest.vars into a test case's vars for comparison purposes.
 * This mirrors what prepareTests does in the evaluator, ensuring that when
 * we compare stored results (which have merged vars) with fresh test cases
 * (which don't), the vars will match.
 */
function mergeDefaultVars(test: TestCase, defaultTest: TestSuite['defaultTest']): TestCase {
  if (!defaultTest || typeof defaultTest === 'string') {
    return test;
  }
  return {
    ...test,
    vars: {
      ...defaultTest.vars,
      ...test.vars,
    },
  };
}

/**
 * Filters tests based on previous evaluation results
 * @param testSuite - Test suite to filter
 * @param pathOrId - JSON results file path or eval ID
 * @param filterFn - Predicate to determine which results to include
 * @param extractedTestFilter - Optional predicate for runtime-generated tests extracted from results
 * @returns Filtered array of tests
 */
export async function filterTestsByResults(
  testSuite: TestSuite,
  pathOrId: string,
  filterFn: ResultFilterFn,
  extractedTestFilter?: TestFilterFn,
  resultMatchContext?: ResultMatchContext,
): Promise<Tests> {
  if (!testSuite.tests) {
    logger.debug('[filterTestsByResults] No tests in test suite');
    return [];
  }

  logger.debug(`[filterTestsByResults] Loading results from: ${pathOrId}`);

  const cache = resultMatchContext?.resultLoadCache;
  let resultsPromise = cache?.get(pathOrId);
  if (!resultsPromise) {
    resultsPromise = loadStoredResults(pathOrId);
    cache?.set(pathOrId, resultsPromise);
  }
  const results = await resultsPromise;
  if (!results) {
    return [];
  }

  const filteredResults = results.filter(
    (result) =>
      filterFn(result) && (!resultMatchContext || resultMatchContext.includesResult(result)),
  );
  const matchesTest = resultMatchContext?.matchesTest ?? resultIsForTestCase;
  logger.debug(
    `[filterTestsByResults] Found ${filteredResults.length} matching results out of ${results.length} total`,
  );

  if (filteredResults.length === 0) {
    return [];
  }

  // Log unique test cases in filtered results for debugging
  const uniqueVarsInResults = new Set(
    filteredResults.map((r) => JSON.stringify(filterRuntimeVars(r.vars))),
  );
  logger.debug(
    `[filterTestsByResults] ${uniqueVarsInResults.size} unique test cases (by vars) in filtered results`,
  );

  // Match tests against filtered results and restore runtime vars.
  // We try two matching strategies:
  // 1. First, try with defaultTest.vars merged (for new results where defaults are merged)
  // 2. Fallback: try without merging defaults (for old results that don't have defaults merged)
  // This ensures backward compatibility with results stored before the merge was consistent.
  //
  // When a match is found, we restore runtime variables (like _conversation, sessionId)
  // from the result into the test so they're available during re-evaluation.
  const matchedTests: Tests = [];

  for (const test of testSuite.tests) {
    const testWithDefaults = mergeDefaultVars(test, testSuite.defaultTest);

    // Try matching with merged defaults first (new results)
    // Prefer results that have runtime vars to ensure we restore them when available.
    // This prevents issues when a test matches multiple results and only some have runtime vars.
    let matchedResult = filteredResults.find(
      (result) =>
        matchesTest(result, testWithDefaults) && extractRuntimeVars(result.vars) !== undefined,
    );

    // Fallback: any matching result (even without runtime vars)
    if (!matchedResult) {
      matchedResult = filteredResults.find((result) => matchesTest(result, testWithDefaults));
    }

    // Fallback: try matching without defaults (old results that don't have defaults merged)
    if (!matchedResult) {
      const hasDefaultVars =
        testSuite.defaultTest &&
        typeof testSuite.defaultTest !== 'string' &&
        testSuite.defaultTest.vars &&
        Object.keys(testSuite.defaultTest.vars).length > 0;

      if (hasDefaultVars) {
        // Again, prefer results with runtime vars first
        matchedResult = filteredResults.find(
          (result) => matchesTest(result, test) && extractRuntimeVars(result.vars) !== undefined,
        );
        if (!matchedResult) {
          matchedResult = filteredResults.find((result) => matchesTest(result, test));
        }
      }
    }

    if (matchedResult) {
      // Restore runtime variables from the matched result into the test.
      // This ensures variables like _conversation and sessionId are available
      // during re-evaluation, preventing template render errors.
      const runtimeVars = extractRuntimeVars(matchedResult.vars);
      if (runtimeVars) {
        const testWithRuntimeVars: TestCase = {
          ...test,
          vars: {
            ...test.vars,
            ...runtimeVars,
          },
        };
        logger.debug('[filterTestsByResults] Restored runtime vars for test', {
          varKeys: Object.keys(runtimeVars),
        });
        matchedTests.push(testWithRuntimeVars);
      } else {
        logger.debug('[filterTestsByResults] Matched test has no runtime vars to restore');
        matchedTests.push(test);
      }
    }
  }

  logger.debug(
    `[filterTestsByResults] Matched ${matchedTests.length} tests out of ${testSuite.tests.length} in test suite`,
  );

  // Extract tests from results that didn't match any config test.
  // This captures runtime-generated tests (e.g., from remote plugins like cipher-code, wordplay)
  // that exist in results but not in the config file.
  const extractedTests: TestCase[] = [];
  const extractedTestKeys = new Set<string>();
  const matchedResultKeys = new Set<string>();

  // Track which results matched config tests
  const matchedTestsWithDefaults = matchedTests.map((test) =>
    mergeDefaultVars(test, testSuite.defaultTest),
  );
  const resultKey = (result: EvaluateResult) =>
    resultMatchContext
      ? JSON.stringify({
          vars: filterRuntimeVars(result.vars),
          metadata: result.testCase?.metadata,
        })
      : JSON.stringify(filterRuntimeVars(result.vars));
  for (const result of filteredResults) {
    for (const testWithDefaults of matchedTestsWithDefaults) {
      if (matchesTest(result, testWithDefaults)) {
        matchedResultKeys.add(resultKey(result));
        break;
      }
    }
  }

  // Extract tests from unmatched results
  for (const result of filteredResults) {
    const key = resultKey(result);

    // Skip if this result already matched a config test
    if (matchedResultKeys.has(key)) {
      continue;
    }

    // Skip if no testCase data available
    if (!result.testCase) {
      logger.debug('[filterTestsByResults] Skipping result without testCase data for extraction');
      continue;
    }

    if (extractedTestFilter && !extractedTestFilter(result.testCase)) {
      continue;
    }

    // Skip if we already extracted a test with these vars (dedup within extraction)
    if (extractedTestKeys.has(key)) {
      continue;
    }

    // Extract test case, filtering runtime vars and omitting provider (security)
    const extractedTest: TestCase = {
      description: result.testCase.description,
      vars: filterRuntimeVars(result.testCase.vars) || {},
      assert: result.testCase.assert,
      metadata: result.testCase.metadata,
      options: result.testCase.options,
      // Intentionally omit: provider (security - may contain stale credentials)
    };
    extractedTests.push(extractedTest);
    extractedTestKeys.add(key);
  }

  if (extractedTests.length > 0) {
    logger.info(
      `[filterTestsByResults] Extracted ${extractedTests.length} runtime-generated test(s) from results`,
    );
  }

  if (matchedTests.length === 0 && extractedTests.length === 0 && filteredResults.length > 0) {
    logger.warn(
      `[filterTestsByResults] No tests matched ${filteredResults.length} filtered results. ` +
        'This may indicate a vars or provider mismatch between stored results and current test suite. ' +
        'Use LOG_LEVEL=debug for detailed matching info.',
    );
  } else if (matchedTests.length + extractedTests.length < uniqueVarsInResults.size) {
    logger.debug(
      `[filterTestsByResults] Note: ${uniqueVarsInResults.size - matchedTests.length - extractedTests.length} unique test cases in results ` +
        'did not match any test in the current test suite and could not be extracted. ' +
        'This may indicate results without testCase data.',
    );
  }

  // Deduplicate and return combined tests
  return resultMatchContext
    ? [...matchedTests, ...extractedTests]
    : deduplicateTestCases([...matchedTests, ...extractedTests]);
}

type Variant = Scenario['config'][number];

function scenarioDefaultTest(suite: TestSuite): TestCase | undefined {
  return typeof suite.defaultTest === 'object' ? suite.defaultTest : undefined;
}

function declaredScenarioMetadata(suite: TestSuite, variant: Variant, test: TestCase) {
  return { ...scenarioDefaultTest(suite)?.metadata, ...variant.metadata, ...test.metadata };
}

function effectiveScenarioTest(suite: TestSuite, variant: Variant, test: TestCase): TestCase {
  const defaults = scenarioDefaultTest(suite);
  // Match the evaluator's default -> scenario config -> test precedence for compared fields.
  return {
    ...(defaults || {}),
    ...variant,
    ...test,
    vars: { ...defaults?.vars, ...variant.vars, ...test.vars },
    metadata: declaredScenarioMetadata(suite, variant, test),
  };
}

function matchesScenarioCandidate(
  result: EvaluateResult,
  effective: TestCase,
  metadata: TestCase['metadata'],
  metadataKeys: string[],
): boolean {
  const resultMetadata = result.testCase?.metadata;
  return (
    resultIsForTestCase(result, effective) &&
    metadataKeys.every((key) => deepEqual(resultMetadata?.[key], metadata?.[key]))
  );
}

export function createScenarioResultClassifier(suite: TestSuite, scenario: Scenario) {
  const defaults = scenarioDefaultTest(suite);
  const variantMetadataKeys = [
    ...new Set([
      ...Object.keys(defaults?.metadata ?? {}),
      ...scenario.config.flatMap((variant) => Object.keys(variant.metadata ?? {})),
    ]),
  ];
  const metadataKeysForTest = (test: TestCase) => [
    ...new Set([...variantMetadataKeys, ...Object.keys(test.metadata ?? {})]),
  ];
  const candidates = scenario.config.map((variant) =>
    (scenario.tests ?? []).map((test) => ({
      effective: effectiveScenarioTest(suite, variant, test),
      metadata: declaredScenarioMetadata(suite, variant, test),
      metadataKeys: metadataKeysForTest(test),
    })),
  );
  const signatureVarKeys = [
    ...new Set(scenario.config.flatMap((variant) => Object.keys(variant.vars ?? {}))),
  ];
  const signatureMetadataKeys = [
    ...new Set(scenario.config.flatMap((variant) => Object.keys(variant.metadata ?? {}))),
  ];
  const signatures = scenario.config.map((variant) => ({
    vars: { ...defaults?.vars, ...variant.vars },
    metadata: { ...defaults?.metadata, ...variant.metadata },
    providerId: providerToIdentifier(variant.provider ?? defaults?.provider),
  }));
  const configuredMatch = (result: EvaluateResult, index: number) =>
    candidates[index].some((candidate) =>
      matchesScenarioCandidate(
        result,
        candidate.effective,
        candidate.metadata,
        candidate.metadataKeys,
      ),
    );
  const signatureMatch = (result: EvaluateResult, index: number) => {
    if (!result.testCase) {
      return false;
    }
    const resultVars = filterRuntimeVars(result.vars) ?? {};
    const resultProviderId = providerToIdentifier(result.provider);
    return (
      (!signatures[index].providerId ||
        !resultProviderId ||
        signatures[index].providerId === resultProviderId) &&
      signatureVarKeys.every((key) => deepEqual(resultVars[key], signatures[index].vars[key])) &&
      signatureMetadataKeys.every((key) =>
        deepEqual(result.testCase?.metadata?.[key], signatures[index].metadata[key]),
      )
    );
  };

  return {
    matchesAny: (result: EvaluateResult) =>
      scenario.config.some(
        (_, index) => configuredMatch(result, index) || signatureMatch(result, index),
      ),
    forVariant: (index: number): ResultMatchContext => ({
      includesResult: (result) => {
        if (configuredMatch(result, index)) {
          return true;
        }
        if (!signatureMatch(result, index)) {
          return false;
        }
        if (scenario.config.some((_, other) => other !== index && configuredMatch(result, other))) {
          return false;
        }
        return !scenario.config.some(
          (_, other) => other !== index && signatureMatch(result, other),
        );
      },
      matchesTest: (result, test) =>
        matchesScenarioCandidate(
          result,
          effectiveScenarioTest(suite, scenario.config[index], test),
          declaredScenarioMetadata(suite, scenario.config[index], test),
          metadataKeysForTest(test),
        ),
    }),
  };
}

export function topLevelResultMatchContext(suite: TestSuite): ResultMatchContext {
  if (!suite.tests?.length) {
    return { includesResult: () => false, matchesTest: () => false };
  }
  const topLevelVariant: Variant = {};
  const topLevelCandidates = (suite.tests ?? []).map((test) => {
    const metadata = declaredScenarioMetadata(suite, topLevelVariant, test);
    return {
      effective: effectiveScenarioTest(suite, topLevelVariant, test),
      metadata,
      metadataKeys: Object.keys(metadata),
    };
  });
  const scenarioClassifiers = (suite.scenarios ?? []).map((scenario) =>
    createScenarioResultClassifier(suite, scenario),
  );
  const explicitScenarioIds = new Set(
    (suite.scenarios ?? []).flatMap((scenario) =>
      scenario.config.flatMap((variant) =>
        (scenario.tests ?? []).map(
          (test) => declaredScenarioMetadata(suite, variant, test).conversationId,
        ),
      ),
    ),
  );
  return {
    includesResult: (result) => {
      const topLevelMatch = topLevelCandidates.some((candidate) =>
        matchesScenarioCandidate(
          result,
          candidate.effective,
          candidate.metadata,
          candidate.metadataKeys,
        ),
      );
      const scenarioMatch = scenarioClassifiers.some((classifier) => classifier.matchesAny(result));
      const conversationId = result.testCase?.metadata?.conversationId;
      const generatedScenarioId =
        typeof conversationId === 'string' && /^__scenario_\d+__$/.test(conversationId);
      const explicitScenarioId = explicitScenarioIds.has(conversationId);
      if (
        (generatedScenarioId || (conversationId !== undefined && explicitScenarioId)) &&
        !topLevelCandidates.some(
          (candidate) =>
            candidate.metadata.conversationId !== undefined &&
            matchesScenarioCandidate(
              result,
              candidate.effective,
              candidate.metadata,
              candidate.metadataKeys,
            ),
        )
      ) {
        return false;
      }
      return !scenarioMatch || Boolean(topLevelMatch) || conversationId === undefined;
    },
    matchesTest: (result, test) => {
      const metadata = declaredScenarioMetadata(suite, topLevelVariant, test);
      return matchesScenarioCandidate(
        result,
        effectiveScenarioTest(suite, topLevelVariant, test),
        metadata,
        Object.keys(metadata),
      );
    },
  };
}
