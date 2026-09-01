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
  return assertions.some(
    (assertion) =>
      !isRecord(assertion) ||
      Boolean(assertion.provider) ||
      ('assert' in assertion && assertionsOverrideProvider(assertion.assert)),
  );
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

function collectCatalogEnvNames(value: unknown, names = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    const envPattern = /\benv(?:\.([A-Za-z_][\w]*)|\[['"]([^'"]+)['"]\])/g;
    for (const match of value.matchAll(envPattern)) {
      names.add(match[1] ?? match[2]);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectCatalogEnvNames(item, names));
  } else if (isRecord(value)) {
    Object.values(value).forEach((item) => collectCatalogEnvNames(item, names));
  }
  return names;
}

function envOverridesCatalog(env: unknown, availableProviders: ProviderOptions[]): boolean {
  if (env === undefined) {
    return false;
  }
  if (!isRecord(env)) {
    return true;
  }
  const catalogEnvNames = collectCatalogEnvNames(availableProviders);
  return Object.keys(env).some((name) => catalogEnvNames.has(name));
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
    envOverridesCatalog(config.env, availableProviders)
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
