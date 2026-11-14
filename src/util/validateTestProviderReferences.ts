import {
  doesProviderRefMatch,
  getProviderDescriptionForLog,
  type ProviderIdentity,
} from './provider';

import type { Scenario, TestCase } from '../types/index';

export class ProviderReferenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReferenceValidationError';
  }
}

/** Check every declared provider, but only name selected providers in diagnostics. */
export function validateTestProviderReferences(
  tests: TestCase[],
  providers: ProviderIdentity[],
  defaultTest?: Partial<TestCase>,
  scenarios?: Scenario[],
  excluded: ProviderIdentity[] = [],
): void {
  const known = [...providers, ...excluded];

  function validate(test: Partial<TestCase>, context: string) {
    if (!test.providers) {
      return;
    }
    if (!Array.isArray(test.providers)) {
      throw new ProviderReferenceValidationError(`${context}.providers must be an array`);
    }
    for (const ref of test.providers) {
      if (!known.some((provider) => doesProviderRefMatch(ref, provider))) {
        const available =
          providers.map(getProviderDescriptionForLog).join(', ') || '(none selected)';
        const omitted = excluded.length ? `. Excluded by filter: ${excluded.length}` : '';
        const desc = test.description ? ` ("${test.description}")` : '';
        throw new ProviderReferenceValidationError(
          `${context}${desc} references provider "${getProviderDescriptionForLog(ref)}" which does not exist. Available providers: ${available}${omitted}`,
        );
      }
    }
  }

  if (defaultTest) {
    validate(defaultTest, 'defaultTest');
  }
  tests.forEach((test, index) => validate(test, `Test #${index + 1}`));
  scenarios?.forEach((scenario, index) => {
    const desc = scenario.description ? ` ("${scenario.description}")` : '';
    const context = `Scenario #${index + 1}${desc}`;
    scenario.config?.forEach((item, j) => validate(item, `${context} config[${j}]`));
    scenario.tests?.forEach((test, j) => validate(test, `${context} test #${j + 1}`));
  });
}
