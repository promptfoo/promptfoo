import deepEqual from 'fast-deep-equal';

import type { ProviderOptions } from './providers';

const SAFE_TEST_OPTION_KEYS = new Set([
  'disableConversationVar',
  'disableDefaultAsserts',
  'disableVarExpansion',
  'factuality',
  'postprocess',
  'prefix',
  'repeat',
  'rubricPrompt',
  'runSerially',
  'storeOutputAs',
  'suffix',
  'transform',
  'transformVars',
]);

// These assertion types invoke a default grading provider when no provider is
// supplied. Keep this list aligned with MODEL_GRADED_ASSERTION_TYPES in
// assertions/index.ts without importing that module into the shared types layer.
const MODEL_GRADED_ASSERTION_TYPES = new Set([
  'agent-rubric',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'llm-rubric',
  'model-graded-closedqa',
  'model-graded-factuality',
  'pi',
  'search-rubric',
  'trajectory:goal-success',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasProviderAffectingOptions(options: unknown): boolean {
  return isRecord(options) && Object.keys(options).some((key) => !SAFE_TEST_OPTION_KEYS.has(key));
}

function assertionsOverrideProvider(assertions: unknown): boolean {
  if (!Array.isArray(assertions)) {
    return assertions !== undefined;
  }
  return assertions.some((assertion) => {
    if (!isRecord(assertion)) {
      return true;
    }
    if ('provider' in assertion) {
      return true;
    }
    if ('assert' in assertion && assertionsOverrideProvider(assertion.assert)) {
      return true;
    }
    const type = assertion.type;
    if (typeof type !== 'string') {
      return false;
    }
    const baseType = type.startsWith('not-') ? type.slice(4) : type;
    return MODEL_GRADED_ASSERTION_TYPES.has(baseType);
  });
}

function providerReferenceMatchesCatalog(
  reference: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  if (typeof reference !== 'string') {
    return false;
  }
  return availableProviders.some((provider) => {
    const candidates = [provider.id, provider.label].filter(
      (candidate): candidate is string => typeof candidate === 'string',
    );
    if (reference.endsWith('*')) {
      const prefix = reference.slice(0, -1);
      return candidates.some((candidate) => candidate.startsWith(prefix));
    }
    return candidates.some(
      (candidate) => candidate === reference || candidate.startsWith(`${reference}:`),
    );
  });
}

function providerFilterOverridesCatalog(
  providers: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  return (
    !Array.isArray(providers) ||
    providers.some((reference) => !providerReferenceMatchesCatalog(reference, availableProviders))
  );
}

function testCaseOverridesProvider(
  testCase: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  return (
    !isRecord(testCase) ||
    Boolean(testCase.provider) ||
    ('providers' in testCase &&
      providerFilterOverridesCatalog(testCase.providers, availableProviders)) ||
    hasProviderAffectingOptions(testCase.options) ||
    assertionsOverrideProvider(testCase.assert)
  );
}

function testCasesOverrideProvider(tests: unknown, availableProviders: ProviderOptions[]): boolean {
  if (tests === undefined) {
    return false;
  }
  return (
    !Array.isArray(tests) ||
    tests.some((testCase) => testCaseOverridesProvider(testCase, availableProviders))
  );
}

function defaultTestOverridesProvider(
  defaultTest: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  if (defaultTest === undefined) {
    return false;
  }
  return (
    typeof defaultTest === 'string' || testCaseOverridesProvider(defaultTest, availableProviders)
  );
}

function scenariosOverrideProvider(
  scenarios: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  if (scenarios === undefined) {
    return false;
  }
  if (!Array.isArray(scenarios)) {
    return true;
  }
  return scenarios.some((scenario) => {
    if (!isRecord(scenario)) {
      return true;
    }
    return ['config', 'tests'].some(
      (key) => key in scenario && testCasesOverrideProvider(scenario[key], availableProviders),
    );
  });
}

function promptsOverrideProvider(prompts: unknown): boolean {
  if (prompts === undefined) {
    return false;
  }
  if (!Array.isArray(prompts)) {
    return true;
  }
  return prompts.some(
    (prompt) =>
      isRecord(prompt) &&
      'config' in prompt &&
      (!isRecord(prompt.config) || Object.keys(prompt.config).length > 0),
  );
}

function envOverridesCatalog(env: unknown): boolean {
  if (env === undefined) {
    return false;
  }
  if (!isRecord(env)) {
    return true;
  }
  // Provider implementations recognize many implicit env keys (for example,
  // OPENAI_BASE_URL) that can redirect an otherwise approved provider. There is
  // no complete provider-to-env-key registry to validate against, so restricted
  // mode fails closed for non-empty suite env. Process-level administrator env
  // and env templates embedded in catalog entries continue to work.
  return Object.keys(env).length > 0;
}

function evaluateOptionsUseImplicitProvider(evaluateOptions: unknown): boolean {
  if (evaluateOptions === undefined) {
    return false;
  }
  return !isRecord(evaluateOptions) || evaluateOptions.generateSuggestions === true;
}

function normalizeSubmittedProvider(provider: unknown): unknown {
  return typeof provider === 'string' ? { id: provider } : provider;
}

function toJsonWireValue(value: unknown): { success: true; value: unknown } | { success: false } {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? { success: false }
      : { success: true, value: JSON.parse(serialized) };
  } catch {
    return { success: false };
  }
}

function jsonWireValuesEqual(left: unknown, right: unknown): boolean {
  const leftWireValue = toJsonWireValue(left);
  const rightWireValue = toJsonWireValue(right);
  return (
    leftWireValue.success &&
    rightWireValue.success &&
    deepEqual(leftWireValue.value, rightWireValue.value)
  );
}

function providersMatchCatalog(providers: unknown, availableProviders: ProviderOptions[]): boolean {
  return (
    Array.isArray(providers) &&
    providers.every((provider) =>
      availableProviders.some((availableProvider) =>
        jsonWireValuesEqual(normalizeSubmittedProvider(provider), availableProvider),
      ),
    )
  );
}

export function reconcileProvidersWithCatalog(
  providers: ProviderOptions[],
  availableProviders: ProviderOptions[],
): { providers: ProviderOptions[]; isReconciled: boolean } {
  const approvedProviders = providers.flatMap((provider) => {
    const matchingProviders = availableProviders.filter(
      (availableProvider) => availableProvider.id === provider.id,
    );
    if (matchingProviders.length === 0) {
      return [];
    }
    return [
      matchingProviders.find(
        (availableProvider) =>
          availableProvider === provider || deepEqual(availableProvider, provider),
      ) ?? matchingProviders[0],
    ];
  });

  return {
    providers: approvedProviders,
    isReconciled:
      approvedProviders.length === providers.length &&
      approvedProviders.every((provider, index) => provider === providers[index]),
  };
}

export function hasRestrictedProviderOverride(
  config: unknown,
  availableProviders: ProviderOptions[],
): boolean {
  if (!isRecord(config)) {
    return true;
  }
  return (
    testCasesOverrideProvider(config.tests, availableProviders) ||
    defaultTestOverridesProvider(config.defaultTest, availableProviders) ||
    scenariosOverrideProvider(config.scenarios, availableProviders) ||
    promptsOverrideProvider(config.prompts) ||
    (config.extensions !== undefined &&
      (!Array.isArray(config.extensions) || config.extensions.length > 0)) ||
    envOverridesCatalog(config.env) ||
    evaluateOptionsUseImplicitProvider(config.evaluateOptions)
  );
}

export function validateProviderCatalogConfig(
  config: unknown,
  availableProviders: ProviderOptions[],
): { success: true } | { success: false; error: string } {
  if (!isRecord(config) || !providersMatchCatalog(config.providers, availableProviders)) {
    return { success: false, error: 'Provider configuration is not in the administrator catalog' };
  }
  if (hasRestrictedProviderOverride(config, availableProviders)) {
    return {
      success: false,
      error:
        'Evaluation configuration contains provider overrides outside the administrator catalog',
    };
  }
  return { success: true };
}
