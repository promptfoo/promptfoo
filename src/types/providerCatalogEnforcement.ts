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

function testCaseOverridesProvider(testCase: unknown): boolean {
  return (
    !isRecord(testCase) ||
    Boolean(testCase.provider) ||
    (Array.isArray(testCase.providers) && testCase.providers.length > 0) ||
    hasProviderAffectingOptions(testCase.options) ||
    assertionsOverrideProvider(testCase.assert)
  );
}

function testCasesOverrideProvider(tests: unknown): boolean {
  if (tests === undefined) {
    return false;
  }
  return !Array.isArray(tests) || tests.some(testCaseOverridesProvider);
}

function defaultTestOverridesProvider(defaultTest: unknown): boolean {
  if (defaultTest === undefined) {
    return false;
  }
  return typeof defaultTest === 'string' || testCaseOverridesProvider(defaultTest);
}

function scenariosOverrideProvider(scenarios: unknown): boolean {
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
      (key) => key in scenario && testCasesOverrideProvider(scenario[key]),
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

function providersMatchCatalog(providers: unknown, availableProviders: ProviderOptions[]): boolean {
  return (
    Array.isArray(providers) &&
    providers.every((provider) =>
      availableProviders.some((availableProvider) =>
        deepEqual(normalizeSubmittedProvider(provider), availableProvider),
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
    testCasesOverrideProvider(config.tests) ||
    defaultTestOverridesProvider(config.defaultTest) ||
    scenariosOverrideProvider(config.scenarios) ||
    promptsOverrideProvider(config.prompts) ||
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
