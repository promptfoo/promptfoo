import { getMissingAssertionVariables } from './assertionPrerequisites';
import { getFirstRunnableAssertionValueError } from './assertionValueValidation';
import type { AssertionOrSet, ProviderOptions, UnifiedConfig } from '@promptfoo/types';

export type SetupStepId = 1 | 2 | 3 | 4;

export interface SetupIssue {
  id:
    | 'providers'
    | 'prompts'
    | 'tests'
    | 'variables'
    | 'assertions'
    | 'assertionVariables'
    | 'comparisonOutputs'
    | 'comparisonScoring';
  message: string;
  stepId: SetupStepId;
}

export interface SetupReadiness {
  isReadyToRun: boolean;
  issues: SetupIssue[];
  providerCount: number;
  promptCount: number;
  testCount: number;
  requiredVariables: string[];
  testCasesMissingVariables: number[];
  testCasesMissingAssertionVariables: number[];
  testCasesWithInvalidAssertions: number[];
  defaultTestHasInvalidAssertions: boolean;
  plannedBaseRequestCount?: number;
}

const PROVIDER_OPTION_KEYS = new Set([
  'id',
  'label',
  'config',
  'prompts',
  'transform',
  'delay',
  'env',
  'inputs',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isProviderMapShape(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return false;
  }

  return entries.every(([, nestedValue]) => {
    if (!isRecord(nestedValue)) {
      return false;
    }

    return (
      typeof nestedValue.id === 'string' ||
      Object.keys(nestedValue).some((nestedKey) => PROVIDER_OPTION_KEYS.has(nestedKey))
    );
  });
}

function isProviderOptionsShape(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.some((key) => PROVIDER_OPTION_KEYS.has(key));
}

function hasRunnableProviderId(
  provider: ProviderOptions,
): provider is ProviderOptions & { id: string } {
  return typeof provider.id === 'string' && provider.id.trim() !== '';
}

function hasInvalidAssertionValue(testCase: unknown): boolean {
  if (!isRecord(testCase) || !Array.isArray(testCase.assert)) {
    return false;
  }

  return Boolean(getFirstRunnableAssertionValueError(testCase.assert));
}

function getAssertions(testCase: unknown): AssertionOrSet[] {
  return isRecord(testCase) && Array.isArray(testCase.assert)
    ? (testCase.assert as AssertionOrSet[])
    : [];
}

type ComparisonAssertionType = 'select-best' | 'max-score';

function containsComparisonAssertion(
  assertions: AssertionOrSet[],
  type: ComparisonAssertionType,
): boolean {
  return assertions.some((assertion) => assertion.type === type);
}

function getEffectiveAssertions(
  testCase: Record<string, unknown>,
  defaultAssertions: AssertionOrSet[],
): AssertionOrSet[] {
  const disablesDefaultAsserts =
    isRecord(testCase.options) && testCase.options.disableDefaultAsserts === true;
  return [...(disablesDefaultAsserts ? [] : defaultAssertions), ...getAssertions(testCase)];
}

function hasConfiguredComparisonAssertion(
  tests: UnifiedConfig['tests'] | undefined,
  defaultAssertions: AssertionOrSet[],
  type: ComparisonAssertionType,
): boolean {
  if (!Array.isArray(tests)) {
    return countTests(tests) > 0 && containsComparisonAssertion(defaultAssertions, type);
  }

  return tests.some((testCase) => {
    if (!isRecord(testCase)) {
      return false;
    }

    return containsComparisonAssertion(getEffectiveAssertions(testCase, defaultAssertions), type);
  });
}

function hasMaxScoreWithoutScoringAssertion(
  tests: UnifiedConfig['tests'] | undefined,
  defaultAssertions: AssertionOrSet[],
): boolean {
  if (!Array.isArray(tests)) {
    return false;
  }

  return tests.some((testCase) => {
    if (!isRecord(testCase)) {
      return false;
    }

    const assertions = getEffectiveAssertions(testCase, defaultAssertions);
    return (
      containsComparisonAssertion(assertions, 'max-score') &&
      !assertions.some(
        (assertion) => assertion.type !== 'select-best' && assertion.type !== 'max-score',
      )
    );
  });
}

function getComparisonSetupIssues(
  outputCount: number,
  tests: UnifiedConfig['tests'] | undefined,
  defaultAssertions: AssertionOrSet[],
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const hasSelectBest = hasConfiguredComparisonAssertion(tests, defaultAssertions, 'select-best');
  const hasMaxScore = hasConfiguredComparisonAssertion(tests, defaultAssertions, 'max-score');

  if (outputCount < 2 && hasSelectBest) {
    issues.push({
      id: 'comparisonOutputs',
      message:
        'Choose best output needs at least two outputs per test case. Add another provider or prompt.',
      stepId: 1,
    });
  } else if (outputCount < 2 && hasMaxScore) {
    issues.push({
      id: 'comparisonOutputs',
      message:
        'Choose highest score needs at least two outputs per test case. Add another provider or prompt.',
      stepId: 1,
    });
  }

  if (hasMaxScoreWithoutScoringAssertion(tests, defaultAssertions)) {
    issues.push({
      id: 'comparisonScoring',
      message: 'Choose highest score needs at least one other assertion to score each output.',
      stepId: 3,
    });
  }

  return issues;
}

export function extractVariablesFromPrompts(prompts: string[]): string[] {
  const variables = new Set<string>();
  const variablePattern = /{{\s*(\w+)\s*}}/g;

  for (const prompt of prompts) {
    for (const match of prompt.matchAll(variablePattern)) {
      variables.add(match[1]);
    }
  }

  return Array.from(variables);
}

export function normalizeProviders(
  providers: UnifiedConfig['providers'] | undefined,
): ProviderOptions[] {
  const providerList = Array.isArray(providers) ? providers : providers ? [providers] : [];

  return providerList.flatMap((provider) => {
    if (typeof provider === 'string') {
      return provider.trim() === '' ? [] : [{ id: provider }];
    }

    if (!isRecord(provider)) {
      return [];
    }

    if (isProviderMapShape(provider)) {
      return Object.entries(provider).flatMap(([id, providerOptions]) => {
        if (!isRecord(providerOptions)) {
          return [];
        }

        const normalizedProvider = {
          ...(providerOptions as ProviderOptions),
          id:
            typeof providerOptions.id === 'string' && providerOptions.id.trim() !== ''
              ? providerOptions.id
              : id,
        };

        return hasRunnableProviderId(normalizedProvider) ? [normalizedProvider] : [];
      });
    }

    if (isProviderOptionsShape(provider)) {
      const providerOptions = provider as ProviderOptions;
      return hasRunnableProviderId(providerOptions) ? [providerOptions] : [];
    }

    return Object.entries(provider).flatMap(([id, providerOptions]) => {
      if (!isRecord(providerOptions)) {
        return [];
      }

      const normalizedProvider = {
        ...(providerOptions as ProviderOptions),
        id:
          typeof providerOptions.id === 'string' && providerOptions.id.trim() !== ''
            ? providerOptions.id
            : id,
      };

      return hasRunnableProviderId(normalizedProvider) ? [normalizedProvider] : [];
    });
  });
}

export function normalizePrompts(prompts: UnifiedConfig['prompts'] | undefined): string[] {
  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [prompts];
  }

  if (Array.isArray(prompts)) {
    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        }
        if (isRecord(prompt)) {
          if (typeof prompt.raw === 'string' && prompt.raw.trim() !== '') {
            return prompt.raw;
          }
          if (typeof prompt.id === 'string') {
            return prompt.id;
          }
        }
        return '';
      })
      .filter((prompt): prompt is string => prompt.trim() !== '');
  }

  if (isRecord(prompts)) {
    return Object.keys(prompts).filter((prompt) => prompt.trim() !== '');
  }

  return [];
}

export function normalizePromptsForJob(
  prompts: UnifiedConfig['prompts'] | undefined,
): Array<string | Record<string, unknown>> {
  if (Array.isArray(prompts)) {
    return prompts as Array<string | Record<string, unknown>>;
  }

  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [prompts];
  }

  if (isRecord(prompts)) {
    return Object.entries(prompts)
      .filter(
        (entry): entry is [string, string] =>
          entry[0].trim() !== '' && typeof entry[1] === 'string' && entry[1].trim() !== '',
      )
      .map(([raw, label]) => ({ raw, label }));
  }

  return [];
}

export function countTests(tests: UnifiedConfig['tests'] | undefined): number {
  if (Array.isArray(tests)) {
    return tests.length;
  }

  if (typeof tests === 'string') {
    return tests.trim() === '' ? 0 : 1;
  }

  return tests ? 1 : 0;
}

export function getSetupReadiness(config: Partial<UnifiedConfig>): SetupReadiness {
  const providerCount = normalizeProviders(config.providers).length;
  const prompts = normalizePrompts(config.prompts);
  const promptCount = prompts.length;
  const testCount = countTests(config.tests);
  const requiredVariables = extractVariablesFromPrompts(prompts);
  const issues: SetupIssue[] = [];

  if (providerCount === 0) {
    issues.push({
      id: 'providers',
      message: 'Add at least one provider to evaluate.',
      stepId: 1,
    });
  }
  if (promptCount === 0) {
    issues.push({
      id: 'prompts',
      message: 'Add at least one prompt or input.',
      stepId: 2,
    });
  }
  if (testCount === 0) {
    issues.push({
      id: 'tests',
      message: 'Add at least one test case.',
      stepId: 3,
    });
  }

  const defaultVars =
    isRecord(config.defaultTest) && isRecord(config.defaultTest.vars)
      ? config.defaultTest.vars
      : {};
  const testCasesMissingVariables =
    requiredVariables.length > 0 && Array.isArray(config.tests)
      ? config.tests.flatMap((testCase, index) => {
          if (!isRecord(testCase)) {
            return [];
          }

          const testVars = 'vars' in testCase && isRecord(testCase.vars) ? testCase.vars : {};
          const hasMissingVariables = requiredVariables.some(
            (variable) => !(variable in testVars) && !(variable in defaultVars),
          );
          return hasMissingVariables ? [index] : [];
        })
      : [];

  if (testCasesMissingVariables.length > 0) {
    const caseLabel =
      testCasesMissingVariables.length === 1
        ? `Test case ${testCasesMissingVariables[0] + 1} is`
        : `${testCasesMissingVariables.length} test cases are`;
    issues.push({
      id: 'variables',
      message: `${caseLabel} missing values required by your prompts.`,
      stepId: 3,
    });
  }

  const defaultAssertions = getAssertions(config.defaultTest);
  issues.push(
    ...getComparisonSetupIssues(providerCount * promptCount, config.tests, defaultAssertions),
  );

  const assertionVariableIssues = Array.isArray(config.tests)
    ? config.tests.flatMap((testCase, index) => {
        if (!isRecord(testCase)) {
          return [];
        }

        const testVars = isRecord(testCase.vars) ? testCase.vars : {};
        const assertions = getEffectiveAssertions(testCase, defaultAssertions);
        const missingVariables = getMissingAssertionVariables(assertions, {
          ...defaultVars,
          ...testVars,
        });
        return missingVariables.length > 0 ? [{ index, missingVariables }] : [];
      })
    : [];
  const testCasesMissingAssertionVariables = assertionVariableIssues.map(({ index }) => index);

  if (assertionVariableIssues.length > 0) {
    const message =
      assertionVariableIssues.length === 1
        ? `Test case ${assertionVariableIssues[0].index + 1} is missing ${assertionVariableIssues[0].missingVariables.join(' and ')} values required by context assertions.`
        : `${assertionVariableIssues.length} test cases are missing values required by context assertions.`;
    issues.push({
      id: 'assertionVariables',
      message,
      stepId: 3,
    });
  }

  const testCasesWithInvalidAssertions = Array.isArray(config.tests)
    ? config.tests.flatMap((testCase, index) => (hasInvalidAssertionValue(testCase) ? [index] : []))
    : [];
  const defaultTestHasInvalidAssertions = hasInvalidAssertionValue(config.defaultTest);

  if (defaultTestHasInvalidAssertions || testCasesWithInvalidAssertions.length > 0) {
    const invalidTestsMessage =
      testCasesWithInvalidAssertions.length === 1
        ? `test case ${testCasesWithInvalidAssertions[0] + 1}`
        : `${testCasesWithInvalidAssertions.length} test cases`;
    const locationMessage = defaultTestHasInvalidAssertions
      ? testCasesWithInvalidAssertions.length > 0
        ? `your default test and ${invalidTestsMessage}`
        : 'your default test in YAML'
      : invalidTestsMessage;
    issues.push({
      id: 'assertions',
      message: `Add required assertion values in ${locationMessage}.`,
      stepId: 3,
    });
  }

  return {
    isReadyToRun: issues.length === 0,
    issues,
    providerCount,
    promptCount,
    testCount,
    requiredVariables,
    testCasesMissingVariables,
    testCasesMissingAssertionVariables,
    testCasesWithInvalidAssertions,
    defaultTestHasInvalidAssertions,
    plannedBaseRequestCount: Array.isArray(config.tests)
      ? providerCount * promptCount * testCount
      : undefined,
  };
}
