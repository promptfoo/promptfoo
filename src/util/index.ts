import * as path from 'path';

import deepEqual from 'fast-deep-equal';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type EvaluateResult, isApiProvider, isProviderOptions, type TestCase } from '../types';

import type { Vars } from '../types/index';

// Re-export from specialized modules for backwards compatibility
export { createOutputMetadata, writeOutput, writeMultipleOutputs } from './output';
export { setupEnv } from './env';
export { renderEnvOnlyInObject, renderVarsInObject } from './render';
export { parsePathOrGlob, readOutput, readFilters, maybeLoadToolsFromExternalFile } from './file';


export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

function canonicalizeProviderId(id: string): string {
  // Handle file:// prefix
  if (id.startsWith('file://')) {
    const filePath = id.slice('file://'.length);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }

  // Handle other executable prefixes with file paths
  const executablePrefixes = ['exec:', 'python:', 'golang:'];
  for (const prefix of executablePrefixes) {
    if (id.startsWith(prefix)) {
      const filePath = id.slice(prefix.length);
      if (filePath.includes('/') || filePath.includes('\\')) {
        return `${prefix}${path.resolve(filePath)}`;
      }
      return id;
    }
  }

  // For JavaScript/TypeScript files without file:// prefix
  if (
    (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.mjs')) &&
    (id.includes('/') || id.includes('\\'))
  ) {
    return `file://${path.resolve(id)}`;
  }

  return id;
}

function getProviderLabel(provider: any): string | undefined {
  return provider?.label && typeof provider.label === 'string' ? provider.label : undefined;
}

export function providerToIdentifier(
  provider: TestCase['provider'] | { id?: string; label?: string } | undefined,
): string | undefined {
  if (!provider) {
    return undefined;
  }

  if (typeof provider === 'string') {
    return canonicalizeProviderId(provider);
  }

  // Check for label first on any provider type
  const label = getProviderLabel(provider);
  if (label) {
    return label;
  }

  if (isApiProvider(provider)) {
    return canonicalizeProviderId(provider.id());
  }

  if (isProviderOptions(provider)) {
    if (provider.id) {
      return canonicalizeProviderId(provider.id);
    }
    return undefined;
  }

  // Handle any other object with id property
  if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
    return canonicalizeProviderId(provider.id);
  }

  return undefined;
}

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

export function isRunningUnderNpx(): boolean {
  const npmExecPath = getEnvString('npm_execpath');
  const npmLifecycleScript = getEnvString('npm_lifecycle_script');

  return Boolean(
    (npmExecPath && npmExecPath.includes('npx')) ||
      process.execPath.includes('npx') ||
      (npmLifecycleScript && npmLifecycleScript.includes('npx')),
  );
}

