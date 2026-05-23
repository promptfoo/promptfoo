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

interface NormalizedPrompt {
  raw: string;
  id?: string;
  label?: string;
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

function getVars(testCase: Record<string, unknown>): Record<string, unknown> {
  return isRecord(testCase.vars) ? testCase.vars : {};
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
    ? (testCase.assert.filter(
        (assertion) => isRecord(assertion) && typeof assertion.type === 'string',
      ) as AssertionOrSet[])
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

function referenceMatchesValue(reference: string, value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return (
    value === reference ||
    (reference.endsWith('*') && value.startsWith(reference.slice(0, -1))) ||
    value.startsWith(`${reference}:`)
  );
}

function promptMatchesReference(prompt: NormalizedPrompt, reference: string): boolean {
  return (
    referenceMatchesValue(reference, prompt.raw) ||
    referenceMatchesValue(reference, prompt.label) ||
    referenceMatchesValue(reference, prompt.id)
  );
}

function providerMatchesReference(provider: ProviderOptions, reference: string): boolean {
  return (
    (hasRunnableProviderId(provider) && referenceMatchesValue(reference, provider.id)) ||
    (typeof provider.label === 'string' && referenceMatchesValue(reference, provider.label))
  );
}

function isAllowedByReferences<T>(
  item: T,
  references: unknown,
  matches: (item: T, reference: string) => boolean,
): boolean {
  if (!Array.isArray(references)) {
    return true;
  }

  return references.some((reference) => typeof reference === 'string' && matches(item, reference));
}

function getRunnablePromptsForTest(
  testCase: Record<string, unknown>,
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
): NormalizedPrompt[] {
  const promptsAllowedByTest = prompts.filter((prompt) =>
    isAllowedByReferences(prompt, testCase.prompts, promptMatchesReference),
  );
  if (providers.length === 0) {
    return promptsAllowedByTest;
  }

  const selectedProviders = providers.filter((provider) =>
    isAllowedByReferences(provider, testCase.providers, providerMatchesReference),
  );
  return promptsAllowedByTest.filter((prompt) =>
    selectedProviders.some((provider) =>
      isAllowedByReferences(prompt, provider.prompts, promptMatchesReference),
    ),
  );
}

function countOutputsForTest(
  testCase: Record<string, unknown>,
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
): number {
  return providers
    .filter((provider) =>
      isAllowedByReferences(provider, testCase.providers, providerMatchesReference),
    )
    .reduce(
      (count, provider) =>
        count +
        prompts.filter(
          (prompt) =>
            isAllowedByReferences(prompt, testCase.prompts, promptMatchesReference) &&
            isAllowedByReferences(prompt, provider.prompts, promptMatchesReference),
        ).length,
      0,
    );
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
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
  tests: UnifiedConfig['tests'] | undefined,
  defaultAssertions: AssertionOrSet[],
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const providerCount = providers.length;
  const promptCount = prompts.length;
  let hasInsufficientSelectBest = false;
  let hasInsufficientMaxScore = false;

  if (Array.isArray(tests)) {
    for (const testCase of tests) {
      if (!isRecord(testCase)) {
        continue;
      }

      const assertions = getEffectiveAssertions(testCase, defaultAssertions);
      const outputCount = countOutputsForTest(testCase, providers, prompts);
      hasInsufficientSelectBest ||=
        outputCount < 2 && containsComparisonAssertion(assertions, 'select-best');
      hasInsufficientMaxScore ||=
        outputCount < 2 && containsComparisonAssertion(assertions, 'max-score');
    }
  } else if (countTests(tests) > 0 && providerCount * promptCount < 2) {
    hasInsufficientSelectBest = containsComparisonAssertion(defaultAssertions, 'select-best');
    hasInsufficientMaxScore = containsComparisonAssertion(defaultAssertions, 'max-score');
  }

  if (hasInsufficientSelectBest || hasInsufficientMaxScore) {
    const label = hasInsufficientSelectBest ? 'Choose best output' : 'Choose highest score';
    // Route the user to whichever axis is shorter — adding to the longer one would not increase
    // outputs per test case.
    issues.push({
      id: 'comparisonOutputs',
      message: `${label} needs at least two outputs per test case. Add another provider or prompt.`,
      stepId: providerCount <= promptCount ? 1 : 2,
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
  const expressionPattern = /{{\s*([^{}\s|]+)\s*(?:\|[^}]+)?}}|{%\s*(?:if|elif)\s+([^{}\s]+).*?%}/g;
  const forLoopPattern = /{%\s*for\s+(\w+)\s+in\s+([^{}\s]+).*?%}/g;

  for (const prompt of prompts) {
    const uncommentedPrompt = prompt.replace(/{#[\s\S]*?#}/g, '');
    for (const match of uncommentedPrompt.matchAll(expressionPattern)) {
      const variable = match[1] || match[2];
      if (variable) {
        variables.add(variable);
      }
    }
    for (const match of uncommentedPrompt.matchAll(forLoopPattern)) {
      variables.delete(match[1]);
      variables.add(match[2]);
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
  return normalizePromptCandidates(prompts).map((prompt) => prompt.raw);
}

function normalizePromptCandidates(
  prompts: UnifiedConfig['prompts'] | undefined,
): NormalizedPrompt[] {
  if (typeof prompts === 'string') {
    return prompts.trim() === '' ? [] : [{ raw: prompts, label: prompts }];
  }

  if (Array.isArray(prompts)) {
    return prompts
      .map((prompt): NormalizedPrompt | undefined => {
        if (typeof prompt === 'string') {
          return { raw: prompt, label: prompt };
        }
        if (isRecord(prompt)) {
          if (typeof prompt.raw === 'string' && prompt.raw.trim() !== '') {
            return {
              raw: prompt.raw,
              id: typeof prompt.id === 'string' ? prompt.id : undefined,
              label: typeof prompt.label === 'string' ? prompt.label : undefined,
            };
          }
          if (typeof prompt.id === 'string') {
            return {
              raw: prompt.id,
              id: prompt.id,
              label: typeof prompt.label === 'string' ? prompt.label : undefined,
            };
          }
        }
        return undefined;
      })
      .filter((prompt): prompt is NormalizedPrompt => Boolean(prompt?.raw.trim()));
  }

  if (isRecord(prompts)) {
    return Object.entries(prompts).flatMap(([raw, label]) =>
      raw.trim() !== '' && typeof label === 'string' ? [{ raw, label }] : [],
    );
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
  const providers = normalizeProviders(config.providers);
  const providerCount = providers.length;
  const promptCandidates = normalizePromptCandidates(config.prompts);
  const prompts = promptCandidates.map((prompt) => prompt.raw);
  const promptCount = promptCandidates.length;
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

          const testVars = getVars(testCase);
          const testRequiredVariables = extractVariablesFromPrompts(
            getRunnablePromptsForTest(testCase, providers, promptCandidates).map(
              (prompt) => prompt.raw,
            ),
          );
          const hasMissingVariables = testRequiredVariables.some(
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
    ...getComparisonSetupIssues(providers, promptCandidates, config.tests, defaultAssertions),
  );

  const assertionVariableIssues = Array.isArray(config.tests)
    ? config.tests.flatMap((testCase, index) => {
        if (!isRecord(testCase)) {
          return [];
        }

        const testVars = getVars(testCase);
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
  const defaultAssertionsApply =
    !Array.isArray(config.tests) ||
    config.tests.some((testCase) => {
      if (!isRecord(testCase)) {
        return true;
      }
      const options = 'options' in testCase ? testCase.options : undefined;
      return !isRecord(options) || options.disableDefaultAsserts !== true;
    });
  const defaultTestHasInvalidAssertions =
    defaultAssertionsApply && hasInvalidAssertionValue(config.defaultTest);

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
