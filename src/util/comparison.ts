import deepEqual from 'fast-deep-equal';
import { type EvaluateResult, type TestCase } from '../types';
import { providerToIdentifier } from './provider';

import type { Vars } from '../types/index';

/**
 * Runtime variables that are added during evaluation but aren't part
 * of the original test definition. These should be filtered when
 * comparing test cases for matching purposes.
 *
 * - _conversation: Added by the evaluator for multi-turn conversations
 * - sessionId: Added by multi-turn strategy providers (GOAT, Crescendo, SIMBA)
 */
const RUNTIME_VAR_KEYS = ['_conversation', 'sessionId'] as const;

/**
 * Filters out runtime-only variables that are added during evaluation
 * but aren't part of the original test definition.
 *
 * This is used when comparing test cases to determine if a result
 * corresponds to a particular test, regardless of runtime state.
 */
export function filterRuntimeVars(vars: Vars | undefined): Vars | undefined {
  if (!vars) {
    return vars;
  }
  const filtered = { ...vars };
  for (const key of RUNTIME_VAR_KEYS) {
    delete filtered[key];
  }
  return filtered;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const providersMatch = testCase.provider
    ? providerToIdentifier(testCase.provider) === providerToIdentifier(result.provider)
    : true;

  // Filter out runtime variables like _conversation and sessionId when matching.
  // These are added by multi-turn providers during evaluation but shouldn't affect test matching.
  const resultVars = filterRuntimeVars(result.vars);
  const testVars = filterRuntimeVars(testCase.vars);
  return varsMatch(testVars, resultVars) && providersMatch;
}
