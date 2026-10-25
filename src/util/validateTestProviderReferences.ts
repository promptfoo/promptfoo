import { getProviderIdAndLabel } from './eval/filterProviders';
import { doesProviderRefMatch, getProviderDescription } from './provider';

import type { ProviderOptions, Scenario, TestCase } from '../types/index';
import type { ApiProvider, ProviderOptionsMap } from '../types/providers';

export type RawProviderConfig =
  | string
  | ProviderOptions
  | ProviderOptionsMap
  | ((...args: unknown[]) => unknown);

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

/**
 * Matches a provider reference against a raw provider config (pre-instantiation) using the
 * same id/label comparison as instantiated providers.
 */
function doesProviderConfigRefMatch(
  ref: string,
  provider: RawProviderConfig,
  index: number,
): boolean {
  const { id, label } = getProviderIdAndLabel(provider, index);
  const fake = { id: () => id, label } as unknown as ApiProvider;
  // A ProviderOptionsMap config reports the map key separately from the resolved id;
  // also match against the raw config's own id/label fields.
  if (doesProviderRefMatch(ref, fake)) {
    return true;
  }
  if (typeof provider === 'object' && provider !== null && !Array.isArray(provider)) {
    const rawId = 'id' in provider ? provider.id : undefined;
    const rawLabel = 'label' in provider ? provider.label : undefined;
    if (
      typeof rawId === 'string' &&
      doesProviderRefMatch(ref, { id: () => rawId, label: rawLabel } as unknown as ApiProvider)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a single provider reference against available providers.
 */
function validateProviderRef(
  ref: string,
  providers: ApiProvider[],
  context: string,
  providerConfigs: RawProviderConfig[],
): void {
  if (!referenceExists(ref, providers, providerConfigs)) {
    const available = providers.map(getProviderDescription).join(', ');
    throw new ProviderReferenceValidationError(
      `${context} references provider "${ref}" which does not exist. Available providers: ${available}`,
    );
  }
}

/**
 * Validates that a provider reference exists in the test suite. When --filter-providers
 * narrows the instantiated set, a reference that matches a pre-filter provider config
 * counts as valid: it exists in the unfiltered suite, and the per-test provider filter
 * drops such tests at run time.
 */
function referenceExists(
  ref: string,
  providers: ApiProvider[],
  providerConfigs: RawProviderConfig[],
): boolean {
  if (providers.some((p) => doesProviderRefMatch(ref, p))) {
    return true;
  }
  if (!Array.isArray(providerConfigs)) {
    return false;
  }
  return providerConfigs.some((provider, index) =>
    doesProviderConfigRefMatch(ref, provider, index),
  );
}

/**
 * Validates provider references for a single test case.
 */
function validateTestProviders(
  test: TestCase | Partial<TestCase>,
  providers: ApiProvider[],
  context: string,
  providerConfigs: RawProviderConfig[],
): void {
  if (!test.providers) {
    return;
  }

  if (!Array.isArray(test.providers)) {
    throw new ProviderReferenceValidationError(`${context}.providers must be an array`);
  }

  const desc = 'description' in test && test.description ? ` ("${test.description}")` : '';
  for (const ref of test.providers) {
    validateProviderRef(ref, providers, `${context}${desc}`, providerConfigs);
  }
}

/**
 * Validate that test case provider references match available providers.
 *
 * @param tests - Array of test cases to validate
 * @param providers - Array of available providers
 * @param defaultTest - Optional default test case to validate
 * @param scenarios - Optional array of scenarios to validate
 * @param providerConfigs - Optional raw provider configs before --filter-providers;
 *   references matching them are treated as valid even if the filter removed the provider
 * @throws ProviderReferenceValidationError if any provider reference is invalid
 */
export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ApiProvider[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
  providerConfigs: RawProviderConfig[] = [],
): void {
  // Validate defaultTest.providers
  if (defaultTest) {
    validateTestProviders(defaultTest, providers, 'defaultTest', providerConfigs);
  }

  // Validate each test's providers
  for (let i = 0; i < tests.length; i++) {
    validateTestProviders(tests[i], providers, `Test #${i + 1}`, providerConfigs);
  }

  // Validate scenario tests and config
  if (scenarios) {
    scenarios.forEach((scenario, i) => {
      const scenarioDesc = scenario.description ? ` ("${scenario.description}")` : '';

      // Validate scenario config items (partial test cases)
      if (scenario.config) {
        scenario.config.forEach((configItem, j) => {
          validateTestProviders(
            configItem,
            providers,
            `Scenario #${i + 1}${scenarioDesc} config[${j}]`,
            providerConfigs,
          );
        });
      }

      // Validate scenario tests
      if (scenario.tests) {
        scenario.tests.forEach((test, j) => {
          validateTestProviders(
            test,
            providers,
            `Scenario #${i + 1}${scenarioDesc} test #${j + 1}`,
            providerConfigs,
          );
        });
      }
    });
  }
}
