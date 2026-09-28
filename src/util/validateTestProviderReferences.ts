import { doesProviderRefMatch, getProviderDescription } from './provider';
import { getProviderIdAndLabel } from './eval/filterProviders';

import type { Scenario, TestCase } from '../types/index';
import type { ApiProvider, ProviderOptions, ProviderOptionsMap } from '../types/providers';

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

/**
 * Checks if a provider reference matches a provider config (without instantiating it).
 * Uses the same matching logic as doesProviderRefMatch but works with raw configs.
 */
function refMatchesProviderConfig(
  ref: string,
  provider: string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown),
  index: number,
): boolean {
  const { id, label } = getProviderIdAndLabel(provider, index);

  if (label && label === ref) {
    return true;
  }
  if (id === ref) {
    return true;
  }
  if (ref.endsWith('*')) {
    const prefix = ref.slice(0, -1);
    if (label?.startsWith(prefix) || id.startsWith(prefix)) {
      return true;
    }
  }
  if (label?.startsWith(`${ref}:`) || id.startsWith(`${ref}:`)) {
    return true;
  }
  return false;
}

/**
 * Checks if a ref matches any provider in the excluded (filtered-out) set.
 */
function refMatchesExcludedProviders(
  ref: string,
  excludedConfigs: (string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown))[],
): boolean {
  return excludedConfigs.some((config, index) => refMatchesProviderConfig(ref, config, index));
}

/**
 * Validates a single provider reference against available providers.
 * If the ref doesn't match but exists in excludedConfigs, it is silently dropped.
 */
function validateProviderRef(
  ref: string,
  providers: ApiProvider[],
  context: string,
  excludedConfigs?: (string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown))[],
): boolean {
  if (providers.some((p) => doesProviderRefMatch(ref, p))) {
    return true;
  }

  if (excludedConfigs && refMatchesExcludedProviders(ref, excludedConfigs)) {
    return false;
  }

  const available = providers.map(getProviderDescription).join(', ');
  throw new ProviderReferenceValidationError(
    `${context} references provider "${ref}" which does not exist. Available providers: ${available}`,
  );
}

/**
 * Validates provider references for a single test case.
 * Returns the filtered list of provider refs (with excluded ones removed).
 */
function validateTestProviders(
  test: TestCase | Partial<TestCase>,
  providers: ApiProvider[],
  context: string,
  excludedConfigs?: (string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown))[],
): string[] | undefined {
  if (!test.providers) {
    return undefined;
  }

  if (!Array.isArray(test.providers)) {
    throw new ProviderReferenceValidationError(`${context}.providers must be an array`);
  }

  const desc = 'description' in test && test.description ? ` ("${test.description}")` : '';
  const validRefs: string[] = [];
  for (const ref of test.providers) {
    const isValid = validateProviderRef(ref, providers, `${context}${desc}`, excludedConfigs);
    if (isValid) {
      validRefs.push(ref);
    }
  }
  return validRefs;
}

/**
 * Validate that test case provider references match available providers.
 *
 * @param tests - Array of test cases to validate
 * @param providers - Array of available providers
 * @param defaultTest - Optional default test case to validate
 * @param scenarios - Optional array of scenarios to validate
 * @param excludedProviderConfigs - Optional array of provider configs that were filtered out.
 *   When provided, test refs matching these configs are silently dropped instead of throwing.
 * @throws ProviderReferenceValidationError if any provider reference is invalid
 */
export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ApiProvider[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
  excludedProviderConfigs?: (string | ProviderOptions | ProviderOptionsMap | ((...args: unknown[]) => unknown))[],
): void {
  if (defaultTest) {
    const validRefs = validateTestProviders(defaultTest, providers, 'defaultTest', excludedProviderConfigs);
    if (validRefs) {
      defaultTest.providers = validRefs;
    }
  }

  for (let i = 0; i < tests.length; i++) {
    const validRefs = validateTestProviders(tests[i], providers, `Test #${i + 1}`, excludedProviderConfigs);
    if (validRefs) {
      tests[i].providers = validRefs;
    }
  }

  if (scenarios) {
    scenarios.forEach((scenario, i) => {
      const scenarioDesc = scenario.description ? ` ("${scenario.description}")` : '';

      if (scenario.config) {
        scenario.config.forEach((configItem, j) => {
          const validRefs = validateTestProviders(
            configItem,
            providers,
            `Scenario #${i + 1}${scenarioDesc} config[${j}]`,
            excludedProviderConfigs,
          );
          if (validRefs) {
            configItem.providers = validRefs;
          }
        });
      }

      if (scenario.tests) {
        scenario.tests.forEach((test, j) => {
          const validRefs = validateTestProviders(
            test,
            providers,
            `Scenario #${i + 1}${scenarioDesc} test #${j + 1}`,
            excludedProviderConfigs,
          );
          if (validRefs) {
            test.providers = validRefs;
          }
        });
      }
    });
  }
}
