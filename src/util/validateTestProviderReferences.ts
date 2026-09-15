import { doesProviderRefMatch, getProviderDescription } from './provider';

import type { Scenario, TestCase } from '../types/index';
import type { ApiProvider } from '../types/providers';

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

export type ProviderDescriptor = {
  id: string;
  label?: string;
};

export type ValidateTestProviderReferencesOptions = {
  unfilteredProviders?: ProviderDescriptor[];
};

function doesRefMatchDescriptor(ref: string, desc: ProviderDescriptor): boolean {
  return doesProviderRefMatch(ref, {
    id: () => desc.id,
    label: desc.label,
  } as ApiProvider);
}

/**
 * Validates a single provider reference against available providers.
 */
function validateProviderRef(
  ref: string,
  providers: ApiProvider[],
  context: string,
  options?: ValidateTestProviderReferencesOptions,
): void {
  if (providers.some((p) => doesProviderRefMatch(ref, p))) {
    return;
  }
  if (
    options?.unfilteredProviders &&
    options.unfilteredProviders.some((d) => doesRefMatchDescriptor(ref, d))
  ) {
    return;
  }
  const available = providers.map(getProviderDescription).join(', ');
  throw new ProviderReferenceValidationError(
    `${context} references provider "${ref}" which does not exist. Available providers: ${available}`,
  );
}

/**
 * Validates provider references for a single test case.
 */
function validateTestProviders(
  test: TestCase | Partial<TestCase>,
  providers: ApiProvider[],
  context: string,
  options?: ValidateTestProviderReferencesOptions,
): void {
  if (!test.providers) {
    return;
  }

  if (!Array.isArray(test.providers)) {
    throw new ProviderReferenceValidationError(`${context}.providers must be an array`);
  }

  const desc = 'description' in test && test.description ? ` ("${test.description}")` : '';
  for (const ref of test.providers) {
    validateProviderRef(ref, providers, `${context}${desc}`, options);
  }
}

/**
 * Validate that test case provider references match available providers.
 *
 * @param tests - Array of test cases to validate
 * @param providers - Array of available providers
 * @param defaultTest - Optional default test case to validate
 * @param scenarios - Optional array of scenarios to validate
 * @param options - Optional validation options, including unfilteredProviders for CLI filtered runs
 * @throws ProviderReferenceValidationError if any provider reference is invalid
 */
export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ApiProvider[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
  options?: ValidateTestProviderReferencesOptions,
): void {
  // Validate defaultTest.providers
  if (defaultTest) {
    validateTestProviders(defaultTest, providers, 'defaultTest', options);
  }

  // Validate each test's providers
  for (let i = 0; i < tests.length; i++) {
    validateTestProviders(tests[i], providers, `Test #${i + 1}`, options);
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
            options,
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
            options,
          );
        });
      }
    });
  }
}

