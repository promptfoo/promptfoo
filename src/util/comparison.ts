import deepEqual from 'fast-deep-equal';
import logger from '../logger';
import { type EvaluateResult, type TestCase } from '../types';
import { providerToIdentifier } from './provider';

import type { Vars } from '../types/index';

/**
 * Explicit runtime variable names that don't follow the underscore convention.
 * These are added during evaluation but aren't part of the original test definition.
 *
 * - sessionId: Added by multi-turn strategy providers (GOAT, Crescendo)
 *
 * Note: Variables starting with underscore (e.g., _conversation) are automatically
 * treated as runtime variables and filtered out.
 */
const EXPLICIT_RUNTIME_VAR_KEYS = ['sessionId'] as const;

/**
 * Checks if a variable key is a runtime-only variable that should be filtered
 * when comparing test cases.
 *
 * Runtime variables are identified by:
 * 1. Starting with underscore (_) - convention for internal/runtime vars
 * 2. Being in the explicit runtime var list (for legacy vars like sessionId)
 */
export function isRuntimeVar(key: string): boolean {
  return key.startsWith('_') || EXPLICIT_RUNTIME_VAR_KEYS.includes(key as any);
}

/**
 * Filters out runtime-only variables that are added during evaluation
 * but aren't part of the original test definition.
 *
 * This is used when comparing test cases to determine if a result
 * corresponds to a particular test, regardless of runtime state.
 *
 * Runtime variables are identified by:
 * - Starting with underscore (e.g., _conversation, _metadata)
 * - Being in the explicit list (e.g., sessionId for backward compatibility)
 */
export function filterRuntimeVars(vars: Vars | undefined): Vars | undefined {
  if (!vars) {
    return vars;
  }
  const filtered: Vars = {};
  for (const [key, value] of Object.entries(vars)) {
    if (!isRuntimeVar(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

/**
 * Generate a unique key for a test case for deduplication purposes.
 * Excludes runtime variables and includes strategyId to distinguish tests
 * with the same prompt but different strategies.
 *
 * @param testCase - The test case to generate a key for
 * @returns A JSON string that uniquely identifies the test case
 */
export function getTestCaseDeduplicationKey(testCase: TestCase): string {
  const filteredVars = filterRuntimeVars(testCase.vars);
  const strategyId = testCase.metadata?.strategyId || 'none';
  return JSON.stringify({ vars: filteredVars, strategyId });
}

/**
 * Deduplicates an array of test cases based on their vars and strategyId.
 * Tests with the same vars but different strategies are considered different.
 * Runtime variables (like _conversation, sessionId) are filtered out before comparison.
 *
 * @param tests - Array of test cases to deduplicate
 * @returns Deduplicated array of test cases
 */
export function deduplicateTestCases(tests: TestCase[]): TestCase[] {
  const seen = new Set<string>();
  return tests.filter((test) => {
    const key = getTestCaseDeduplicationKey(test);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const testProviderId = testCase.provider ? providerToIdentifier(testCase.provider) : undefined;
  const resultProviderId = providerToIdentifier(result.provider);

  // Provider matching rules:
  // 1. If test doesn't specify a provider, any result matches
  // 2. If test has provider but result doesn't, still match (result provider info may be missing,
  //    e.g., agentic providers store target provider, or cloud results may not include provider)
  // 3. If both have providers, they must match
  const providersMatch =
    !testProviderId || !resultProviderId || testProviderId === resultProviderId;

  // Filter out runtime variables like _conversation and sessionId when matching.
  // These are added by multi-turn providers during evaluation but shouldn't affect test matching.
  const resultVars = filterRuntimeVars(result.vars);
  const testVars = filterRuntimeVars(testCase.vars);
  const doVarsMatch = varsMatch(testVars, resultVars);
  const isMatch = doVarsMatch && providersMatch;

  // Log matching details at debug level for troubleshooting filter issues
  if (!isMatch) {
    const varKeys = testVars ? Object.keys(testVars).join(', ') : 'none';
    logger.debug(
      `[resultIsForTestCase] No match: vars=${doVarsMatch}, providers=${providersMatch}`,
      {
        testProvider: testProviderId || 'none',
        resultProvider: resultProviderId || 'none',
        testVarKeys: varKeys,
      },
    );
  }

  return isMatch;
}
