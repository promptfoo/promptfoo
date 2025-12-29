import type { TestCase } from '../types/index';
import type { ApiProvider } from '../types/providers';
import { doesProviderRefMatch, getProviderIdentifier } from './provider';

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

/**
 * Validate that test case provider references match available providers.
 *
 * @param tests - Array of test cases to validate
 * @param providers - Array of available providers
 * @param defaultTest - Optional default test case to validate
 * @throws ProviderReferenceValidationError if any provider reference is invalid
 */
export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ApiProvider[],
  defaultTest?: Partial<TestCase>,
): void {
  // Validate defaultTest.providers
  if (defaultTest?.providers) {
    if (!Array.isArray(defaultTest.providers)) {
      throw new ProviderReferenceValidationError('defaultTest.providers must be an array');
    }
    for (const ref of defaultTest.providers) {
      if (!providers.some((p) => doesProviderRefMatch(ref, p))) {
        const available = providers.map(getProviderIdentifier).join(', ');
        throw new ProviderReferenceValidationError(
          `defaultTest references provider "${ref}" which does not exist. Available providers: ${available}`,
        );
      }
    }
  }

  // Validate each test's providers
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (!test.providers) {
      continue;
    }

    if (!Array.isArray(test.providers)) {
      throw new ProviderReferenceValidationError(`tests[${i}].providers must be an array`);
    }

    for (const ref of test.providers) {
      if (!providers.some((p) => doesProviderRefMatch(ref, p))) {
        const desc = test.description ? ` ("${test.description}")` : '';
        const available = providers.map(getProviderIdentifier).join(', ');
        throw new ProviderReferenceValidationError(
          `Test #${i + 1}${desc} references provider "${ref}" which does not exist. Available providers: ${available}`,
        );
      }
    }
  }
}
