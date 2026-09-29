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

function hasExternalVarsReference(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  return (
    Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim() !== '')
  );
}

function getTopLevelVariable(variable: string): string {
  return variable.split(/[.\[\]\s]/, 1)[0] || variable;
}

function hasConfigVariable(
  testCase: Record<string, unknown>,
  defaultTest: Record<string, unknown>,
  variable: string,
): boolean {
  const topLevelVariable = getTopLevelVariable(variable);
  return (
    hasExternalVarsReference(testCase.vars) ||
    hasExternalVarsReference(defaultTest.vars) ||
    topLevelVariable in getVars(testCase) ||
    topLevelVariable in getVars(defaultTest)
  );
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

// Deliberately shallow (top-level) — does NOT descend into assert-sets. The
// runtime detects comparison assertions (select-best / max-score) only at the top
// level of test.assert and silently skips any nested inside an assert-set, so the
// readiness gate mirrors that to avoid falsely blocking a config the runtime runs.
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
    referenceMatchesValue(reference, prompt.label) || referenceMatchesValue(reference, prompt.id)
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

function getEffectiveReferences(
  testCase: Record<string, unknown>,
  defaultTest: Record<string, unknown>,
  key: 'prompts' | 'providers',
): unknown {
  return Array.isArray(testCase[key]) ? testCase[key] : defaultTest[key];
}

function getRunnablePromptsForTest(
  testCase: Record<string, unknown>,
  defaultTest: Record<string, unknown>,
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
): NormalizedPrompt[] {
  const promptReferences = getEffectiveReferences(testCase, defaultTest, 'prompts');
  const providerReferences = getEffectiveReferences(testCase, defaultTest, 'providers');
  const promptsAllowedByTest = prompts.filter((prompt) =>
    isAllowedByReferences(prompt, promptReferences, promptMatchesReference),
  );
  if (providers.length === 0) {
    return promptsAllowedByTest;
  }

  const selectedProviders = providers.filter((provider) =>
    isAllowedByReferences(provider, providerReferences, providerMatchesReference),
  );
  return promptsAllowedByTest.filter((prompt) =>
    selectedProviders.some((provider) =>
      isAllowedByReferences(prompt, provider.prompts, promptMatchesReference),
    ),
  );
}

function countOutputsForTest(
  testCase: Record<string, unknown>,
  defaultTest: Record<string, unknown>,
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
): number {
  const promptReferences = getEffectiveReferences(testCase, defaultTest, 'prompts');
  const providerReferences = getEffectiveReferences(testCase, defaultTest, 'providers');

  return providers
    .filter((provider) =>
      isAllowedByReferences(provider, providerReferences, providerMatchesReference),
    )
    .reduce(
      (count, provider) =>
        count +
        prompts.filter(
          (prompt) =>
            isAllowedByReferences(prompt, promptReferences, promptMatchesReference) &&
            isAllowedByReferences(prompt, provider.prompts, promptMatchesReference),
        ).length,
      0,
    );
}

function mayLoadMultiplePromptsAtRuntime(rawPrompt: string): boolean {
  return (
    rawPrompt.startsWith('file://') ||
    rawPrompt.startsWith('exec:') ||
    /[*?[\]]/.test(rawPrompt) ||
    /\.(?:csv|j2|jsonl?|md|mjs|cjs|js|ts|py|txt|ya?ml|sh|bash|rb|pl|ps1|bat|cmd)$/i.test(rawPrompt)
  );
}

function mayLoadMultipleProvidersAtRuntime(provider: ProviderOptions): boolean {
  return hasRunnableProviderId(provider) && /^file:\/\/.*\.(?:json|ya?ml)$/i.test(provider.id);
}

// A reference (test/defaultTest `prompts` or `providers` entry) that matches no
// static candidate may still resolve against a dynamic candidate's runtime-expanded
// labels, so such an unresolved reference keeps dynamic candidates in scope.
function hasUnresolvedReference<T>(
  references: unknown,
  candidates: T[],
  matches: (candidate: T, reference: string) => boolean,
): boolean {
  return (
    Array.isArray(references) &&
    references.some(
      (reference) =>
        typeof reference === 'string' &&
        !candidates.some((candidate) => matches(candidate, reference)),
    )
  );
}

function hasDynamicOutputForTest(
  testCase: Record<string, unknown>,
  defaultTest: Record<string, unknown>,
  providers: ProviderOptions[],
  prompts: NormalizedPrompt[],
): boolean {
  const promptReferences = getEffectiveReferences(testCase, defaultTest, 'prompts');
  const providerReferences = getEffectiveReferences(testCase, defaultTest, 'providers');
  const promptReferenceUnresolved = hasUnresolvedReference(
    promptReferences,
    prompts,
    promptMatchesReference,
  );
  const providerReferenceUnresolved = hasUnresolvedReference(
    providerReferences,
    providers,
    providerMatchesReference,
  );
  // A candidate is in scope for the test if it is allowed by the test's references,
  // or if it is dynamic and an unresolved reference might resolve to its expansion.
  const promptInScope = (prompt: NormalizedPrompt): boolean =>
    isAllowedByReferences(prompt, promptReferences, promptMatchesReference) ||
    (promptReferenceUnresolved && mayLoadMultiplePromptsAtRuntime(prompt.raw));
  const providerInScope = (provider: ProviderOptions): boolean =>
    isAllowedByReferences(provider, providerReferences, providerMatchesReference) ||
    (providerReferenceUnresolved && mayLoadMultipleProvidersAtRuntime(provider));

  const hasSelectedProvider = providers.some(providerInScope);

  return (
    (hasSelectedProvider &&
      prompts.some(
        (prompt) => mayLoadMultiplePromptsAtRuntime(prompt.raw) && promptInScope(prompt),
      )) ||
    (prompts.some(promptInScope) &&
      providers.some(
        (provider) => mayLoadMultipleProvidersAtRuntime(provider) && providerInScope(provider),
      ))
  );
}

function hasMaxScoreWithoutScoringAssertion(
  tests: UnifiedConfig['tests'] | undefined,
  defaultTest: Record<string, unknown>,
  defaultAssertions: AssertionOrSet[],
): boolean {
  const testCases = Array.isArray(tests)
    ? tests.map((testCase) => (isRecord(testCase) ? testCase : {}))
    : countTests(tests) > 0
      ? [defaultTest]
      : [];

  return testCases.some((testCase) => {
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
  defaultTest: Record<string, unknown>,
  defaultAssertions: AssertionOrSet[],
): SetupIssue[] {
  const issues: SetupIssue[] = [];
  const providerCount = providers.length;
  const promptCount = prompts.length;
  let hasInsufficientSelectBest = false;
  let hasInsufficientMaxScore = false;

  if (Array.isArray(tests)) {
    for (const testCase of tests.map((testCase) => (isRecord(testCase) ? testCase : {}))) {
      const assertions = getEffectiveAssertions(testCase, defaultAssertions);
      const outputCount = countOutputsForTest(testCase, defaultTest, providers, prompts);
      const hasDynamicOutput = hasDynamicOutputForTest(testCase, defaultTest, providers, prompts);
      hasInsufficientSelectBest ||=
        outputCount < 2 &&
        !hasDynamicOutput &&
        containsComparisonAssertion(assertions, 'select-best');
      hasInsufficientMaxScore ||=
        outputCount < 2 &&
        !hasDynamicOutput &&
        containsComparisonAssertion(assertions, 'max-score');
    }
  } else if (countTests(tests) > 0) {
    const outputCount = countOutputsForTest(defaultTest, {}, providers, prompts);
    const hasDynamicOutput = hasDynamicOutputForTest(defaultTest, {}, providers, prompts);
    hasInsufficientSelectBest = containsComparisonAssertion(defaultAssertions, 'select-best');
    hasInsufficientMaxScore = containsComparisonAssertion(defaultAssertions, 'max-score');
    hasInsufficientSelectBest &&= outputCount < 2 && !hasDynamicOutput;
    hasInsufficientMaxScore &&= outputCount < 2 && !hasDynamicOutput;
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

  if (hasMaxScoreWithoutScoringAssertion(tests, defaultTest, defaultAssertions)) {
    issues.push({
      id: 'comparisonScoring',
      message: 'Choose highest score needs at least one other assertion to score each output.',
      stepId: 3,
    });
  }

  return issues;
}

// Intentionally separate from the backend `extractVariablesFromTemplate`
// (src/util/templates.ts): this gate runs in the browser and needs filter,
// conditional, and loop-scope awareness to avoid flagging false "missing variable"
// prerequisites, which the backend's simpler regex extractor does not provide.
// Keep the two in mind together if variable-detection rules change.
export function extractVariablesFromPrompts(prompts: string[]): string[] {
  const variables = new Set<string>();

  for (const prompt of prompts) {
    const uncommentedPrompt = prompt.replace(/{#[\s\S]*?#}/g, '');
    collectTemplateVariables(uncommentedPrompt, variables);
  }

  return Array.from(variables);
}

// Match a single Nunjucks tag at a time — either an output (`{{ ... }}`) or a block
// (`{% ... %}`) — tolerating whitespace-control markers (`{%-`, `-%}`, `{{-`, `-}}`).
// Matching one tag per iteration keeps extraction linear; the previous
// block-spanning regex with several lazy groups backtracked catastrophically on
// unbalanced `{% for %}` templates (a freeze risk while editing a prompt).
const NUNJUCKS_TAG_PATTERN = /{{-?\s*([\s\S]*?)\s*-?}}|{%-?\s*([\s\S]*?)\s*-?%}/g;
const LOOP_TAG_PATTERN = /^for\s+([\s\S]+?)\s+in\s+([\s\S]+)$/;
const CONDITIONAL_TAG_PATTERN = /^(?:if|elif)\s+([\s\S]+)$/;
const STRING_LITERAL_PATTERN = /(["'])(?:\\.|(?!\1)[\s\S])*\1/g;
const IDENTIFIER_PATTERN = /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
const IGNORED_NUNJUCKS_IDENTIFIERS = new Set([
  'and',
  'defined',
  'else',
  'env',
  'false',
  'for',
  'if',
  'in',
  'is',
  'loop',
  'none',
  'not',
  'null',
  'or',
  'true',
  'undefined',
]);

function addVariablesFromExpression(
  expression: string,
  variables: Set<string>,
  localVariables: Set<string>,
): void {
  const expressionWithoutStrings = expression.replace(STRING_LITERAL_PATTERN, '');
  for (const match of expressionWithoutStrings.matchAll(IDENTIFIER_PATTERN)) {
    const variable = getTopLevelVariable(match[0]);
    if (variable && !localVariables.has(variable) && !IGNORED_NUNJUCKS_IDENTIFIERS.has(variable)) {
      variables.add(variable);
    }
  }
}

function getLoopVariables(loopTarget: string): string[] {
  return loopTarget
    .split(',')
    .map((target) => target.trim())
    .filter((target) => /^[A-Za-z_$][\w$]*$/.test(target));
}

function collectTemplateVariables(template: string, variables: Set<string>): void {
  // Track loop-local variables with a scope stack so a name used only inside a
  // `{% for %}` body is not reported as required, while the same name used outside
  // the loop still is. Pairing `for`/`endfor` linearly over the tag stream (instead
  // of matching whole blocks with one regex) avoids catastrophic backtracking.
  const scopeStack: Set<string>[] = [new Set<string>()];

  for (const match of template.matchAll(NUNJUCKS_TAG_PATTERN)) {
    const currentLocals = scopeStack[scopeStack.length - 1];
    const outputExpression = match[1];
    if (outputExpression !== undefined) {
      const expression = outputExpression.split('|', 1)[0].trim();
      if (expression !== '' && !/\s/.test(expression)) {
        addVariablesFromExpression(expression, variables, currentLocals);
      }
      continue;
    }

    const blockExpression = (match[2] ?? '').trim();
    const loopMatch = LOOP_TAG_PATTERN.exec(blockExpression);
    if (loopMatch) {
      // The iterable is evaluated in the enclosing scope, before loop locals exist.
      addVariablesFromExpression(loopMatch[2], variables, currentLocals);
      scopeStack.push(new Set([...currentLocals, ...getLoopVariables(loopMatch[1])]));
      continue;
    }
    if (/^endfor\b/.test(blockExpression)) {
      if (scopeStack.length > 1) {
        scopeStack.pop();
      }
      continue;
    }
    const conditionalMatch = CONDITIONAL_TAG_PATTERN.exec(blockExpression);
    if (conditionalMatch) {
      addVariablesFromExpression(conditionalMatch[1], variables, currentLocals);
    }
  }
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
  const defaultTest = isRecord(config.defaultTest) ? config.defaultTest : {};

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

  const defaultVars = getVars(defaultTest);
  const testCasesMissingVariables =
    requiredVariables.length > 0 && Array.isArray(config.tests)
      ? config.tests.flatMap((testCase, index) => {
          if (!isRecord(testCase)) {
            return [];
          }

          const testRequiredVariables = extractVariablesFromPrompts(
            getRunnablePromptsForTest(testCase, defaultTest, providers, promptCandidates).map(
              (prompt) => prompt.raw,
            ),
          );
          const hasMissingVariables = testRequiredVariables.some(
            (variable) => !hasConfigVariable(testCase, defaultTest, variable),
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
    ...getComparisonSetupIssues(
      providers,
      promptCandidates,
      config.tests,
      defaultTest,
      defaultAssertions,
    ),
  );

  const assertionVariableIssues = Array.isArray(config.tests)
    ? config.tests.flatMap((testCase, index) => {
        if (!isRecord(testCase)) {
          return [];
        }

        const testCaseRecord = testCase as Record<string, unknown>;
        const testVars = getVars(testCaseRecord);
        const assertions = getEffectiveAssertions(testCaseRecord, defaultAssertions);
        const missingVariables = getMissingAssertionVariables(
          assertions,
          {
            ...defaultVars,
            ...testVars,
          },
          hasExternalVarsReference(defaultTest.vars) ||
            hasExternalVarsReference(testCaseRecord.vars),
        );
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
