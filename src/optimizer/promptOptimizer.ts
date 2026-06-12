import chalk from 'chalk';
import { evaluate } from '../evaluator';
import logger from '../logger';
import Eval from '../models/eval';
import { generateIdFromPrompt } from '../models/prompt';
import { OPTIMIZE_PROMPT_SYSTEM_MESSAGE } from '../prompts/index';
import { getDefaultProviders } from '../providers/defaults';
import {
  type CompletedPrompt,
  type EvaluateResult,
  isScenarioConfigValuesRef,
  type Prompt,
  type TestSuite,
} from '../types/index';
import { extractFirstJsonObject, safeJsonStringify } from '../util/json';
import { isPromptAllowed } from '../util/promptMatching';
import { sanitizeObject } from '../util/sanitizer';

import type EvalResult from '../models/evalResult';
import type { UnifiedConfig } from '../types/index';
import type { InternalEvaluateOptions } from '../types/internal';

const DEFAULT_CANDIDATE_COUNT = 3;
const DEFAULT_ROUNDS = 3;
const MAX_FAILURE_EXAMPLES = 6;
const MAX_SUCCESS_EXAMPLES = 3;
const MAX_EXAMPLE_TEXT_LENGTH = 1200;
const DEFAULT_SELECTION_INDEX = 0;
const VALIDATION_SPLIT_MIN = 0;
const VALIDATION_SPLIT_MAX = 0.5;

interface PromptOptimizationCandidate {
  hypothesis?: string;
  prompt: string;
}

interface PromptOptimizationCandidateResponse {
  candidates?: Array<{
    hypothesis?: unknown;
    prompt?: unknown;
  }>;
}

export interface PromptOptimizationResult {
  baselineEval: Eval;
  candidateEval: Eval;
  baselinePrompt: CompletedPrompt;
  baselineValidationEval?: Eval;
  baselineValidationPrompt?: CompletedPrompt;
  bestPrompt: CompletedPrompt;
  bestValidationEval?: Eval;
  bestValidationPrompt?: CompletedPrompt;
  candidates: PromptOptimizationCandidate[];
  improved: boolean;
  rounds: PromptOptimizationRound[];
  searchTestCount: number;
  validationSplit?: number;
  validationTestCount: number;
}

export interface PromptOptimizationRound {
  round: number;
  candidateEval: Eval;
  candidateValidationEval?: Eval;
  candidates: PromptOptimizationCandidate[];
  chosenPrompt: CompletedPrompt;
  chosenValidationPrompt?: CompletedPrompt;
  improved: boolean;
}

export interface PromptOptimizationOptions {
  promptIndex?: number;
  providerIndex?: number;
  validationSplit?: number;
}

interface PromptOptimizationHistoryItem {
  failures: ReturnType<typeof createOptimizationExamples>;
  prompt: string;
  score: number;
}

function truncateText(value: string, maxLength: number = MAX_EXAMPLE_TEXT_LENGTH): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return truncateText(value);
  }
  const serialized = safeJsonStringify(value);
  return serialized ? truncateText(serialized) : undefined;
}

function sanitizeExampleValue(value: unknown, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return stringifyValue(
    sanitizeObject(value, {
      context,
      maxDepth: 4,
    }),
  );
}

function scoreOf(prompt: CompletedPrompt): number {
  const score = prompt.metrics?.score;
  return typeof score === 'number' && Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY;
}

function formatScore(prompt: CompletedPrompt): string {
  const score = scoreOf(prompt);
  return Number.isFinite(score) ? score.toFixed(4) : 'n/a';
}

function createOptimizationExamples(results: EvaluateResult[]) {
  return results.map((result) => ({
    score: result.score,
    success: result.success,
    vars: sanitizeExampleValue(result.vars, 'prompt optimizer vars'),
    output: sanitizeExampleValue(result.response?.output, 'prompt optimizer output'),
    error: sanitizeExampleValue(result.error, 'prompt optimizer error'),
    gradingReason: sanitizeExampleValue(
      result.gradingResult?.reason,
      'prompt optimizer grading reason',
    ),
    namedScores: sanitizeExampleValue(result.namedScores, 'prompt optimizer named scores'),
  }));
}

function toEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult() : result;
}

function buildCandidateGenerationPayload(params: {
  prompt: string;
  failures: EvaluateResult[];
  successes: EvaluateResult[];
  candidateCount: number;
  history?: PromptOptimizationHistoryItem[];
}) {
  return JSON.stringify([
    OPTIMIZE_PROMPT_SYSTEM_MESSAGE,
    {
      role: 'user',
      content:
        safeJsonStringify(
          {
            goal: 'Improve this prompt against the observed evaluation results without changing its intent.',
            candidateCount: params.candidateCount,
            currentPrompt: params.prompt,
            failures: createOptimizationExamples(params.failures),
            successes: createOptimizationExamples(params.successes),
            searchHistory: params.history || [],
            responseFormat: {
              candidates: [
                {
                  hypothesis: 'Why this change should improve the evaluation result.',
                  prompt: 'The full rewritten prompt.',
                },
              ],
            },
          },
          true,
        ) || '{}',
    },
  ]);
}

function normalizeCandidates(
  parsed: PromptOptimizationCandidateResponse,
  originalPrompt: string,
  candidateCount: number,
): PromptOptimizationCandidate[] {
  const deduped = new Set<string>();
  const candidates: PromptOptimizationCandidate[] = [];
  const normalizedOriginalPrompt = originalPrompt.trim();

  for (const candidate of parsed.candidates || []) {
    if (typeof candidate.prompt !== 'string') {
      continue;
    }
    const prompt = candidate.prompt.trim();
    if (!prompt || prompt === normalizedOriginalPrompt || deduped.has(prompt)) {
      continue;
    }
    deduped.add(prompt);
    candidates.push({
      prompt,
      hypothesis:
        typeof candidate.hypothesis === 'string' && candidate.hypothesis.trim().length > 0
          ? candidate.hypothesis.trim()
          : undefined,
    });
    if (candidates.length >= candidateCount) {
      break;
    }
  }

  return candidates;
}

export async function generateOptimizedPromptCandidates(params: {
  prompt: string;
  failures: EvaluateResult[];
  successes: EvaluateResult[];
  candidateCount?: number;
  history?: PromptOptimizationHistoryItem[];
}): Promise<PromptOptimizationCandidate[]> {
  const candidateCount = params.candidateCount ?? DEFAULT_CANDIDATE_COUNT;
  const provider = (await getDefaultProviders()).suggestionsProvider;
  const response = await provider.callApi(
    buildCandidateGenerationPayload({
      prompt: params.prompt,
      failures: params.failures,
      successes: params.successes,
      candidateCount,
      history: params.history,
    }),
  );

  if (response.error || !response.output) {
    throw new Error(
      `Failed to generate optimized prompt candidates: ${response.error || 'Unknown error'}`,
    );
  }

  let parsed: PromptOptimizationCandidateResponse;
  try {
    parsed = extractFirstJsonObject<PromptOptimizationCandidateResponse>(String(response.output));
  } catch (error) {
    throw new Error(
      `Failed to parse optimized prompt candidates: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const candidates = normalizeCandidates(parsed, params.prompt, candidateCount);
  if (candidates.length === 0) {
    throw new Error('Optimizer provider returned no usable prompt candidates.');
  }

  return candidates;
}

/**
 * Generates candidates for an optimization round, returning `null` to signal the
 * caller should stop optimizing while keeping the best prompt found so far.
 *
 * A first-round failure rethrows so genuine misconfiguration (bad provider,
 * unparseable output, no candidates at all) surfaces instead of being hidden
 * behind a silent "no improvement" exit. A later-round failure is expected as
 * the prompt converges (the suggestions provider returns only duplicates or the
 * unchanged prompt) or on a transient provider error, so it is logged and the
 * already-adopted improvements from earlier rounds are preserved.
 */
async function generateRoundCandidatesOrStop(
  round: number,
  params: Parameters<typeof generateOptimizedPromptCandidates>[0],
): Promise<PromptOptimizationCandidate[] | null> {
  try {
    return await generateOptimizedPromptCandidates(params);
  } catch (error) {
    if (round === 1) {
      throw error;
    }
    logger.warn(
      chalk.yellow(
        `Stopping optimization after round ${round - 1}: round ${round} could not generate new prompt candidates (${error instanceof Error ? error.message : String(error)}). Keeping the best prompt found so far.`,
      ),
    );
    return null;
  }
}

function logOptimizationOutcome(params: {
  improved: boolean;
  baselinePrompt: CompletedPrompt;
  bestPrompt: CompletedPrompt;
  baselineValidationPrompt?: CompletedPrompt;
  bestValidationPrompt?: CompletedPrompt;
}): void {
  const { improved, baselinePrompt, bestPrompt, baselineValidationPrompt, bestValidationPrompt } =
    params;
  if (baselineValidationPrompt && bestValidationPrompt) {
    logger.info(
      improved
        ? chalk.green(
            `Optimization improved validation score from ${formatScore(baselineValidationPrompt)} to ${formatScore(bestValidationPrompt)}.`,
          )
        : chalk.yellow(
            `No candidate exceeded the baseline validation score of ${formatScore(baselineValidationPrompt)}.`,
          ),
    );
    return;
  }
  logger.info(
    improved
      ? chalk.green(
          `Optimization improved score from ${formatScore(baselinePrompt)} to ${formatScore(bestPrompt)}.`,
        )
      : chalk.yellow(`No candidate exceeded the baseline score of ${formatScore(baselinePrompt)}.`),
  );
}

function selectBestPrompt(prompts: CompletedPrompt[]): CompletedPrompt {
  const [firstPrompt, ...rest] = prompts;
  if (!firstPrompt) {
    throw new Error('Optimization eval returned no prompts.');
  }
  return rest.reduce(
    (best, prompt) => (scoreOf(prompt) >= scoreOf(best) ? prompt : best),
    firstPrompt,
  );
}

function selectBestPromptPair(params: {
  searchPrompts: CompletedPrompt[];
  validationPrompts?: CompletedPrompt[];
}): { searchPrompt: CompletedPrompt; validationPrompt?: CompletedPrompt } {
  if (!params.validationPrompts || params.validationPrompts.length === 0) {
    const searchPrompt = selectBestPrompt(params.searchPrompts);
    return { searchPrompt };
  }

  const promptPairs = params.searchPrompts.map((searchPrompt, index) => ({
    searchPrompt,
    validationPrompt: params.validationPrompts?.[index],
  }));
  const [firstPair, ...rest] = promptPairs.filter(
    (pair): pair is { searchPrompt: CompletedPrompt; validationPrompt: CompletedPrompt } =>
      Boolean(pair.validationPrompt),
  );
  if (!firstPair) {
    const searchPrompt = selectBestPrompt(params.searchPrompts);
    return { searchPrompt };
  }

  return rest.reduce((best, pair) => {
    const validationDelta = scoreOf(pair.validationPrompt) - scoreOf(best.validationPrompt);
    if (validationDelta > 0) {
      return pair;
    }
    if (validationDelta === 0 && scoreOf(pair.searchPrompt) >= scoreOf(best.searchPrompt)) {
      return pair;
    }
    return best;
  }, firstPair);
}

function findPromptIndex(prompts: CompletedPrompt[], prompt: CompletedPrompt): number {
  const index = prompts.findIndex(
    (candidate) => candidate.raw === prompt.raw && candidate.label === prompt.label,
  );
  return index >= 0 ? index : 0;
}

function createValidationPartition(
  testSuite: TestSuite,
  validationSplit: number | undefined,
): {
  searchTestSuite: TestSuite;
  validationTestSuite?: TestSuite;
  searchTestCount: number;
  validationTestCount: number;
} {
  if (validationSplit !== undefined && validationSplit > VALIDATION_SPLIT_MIN) {
    if (testSuite.scenarios?.length) {
      throw new Error(
        'validationSplit is not supported for scenario-based prompt optimization; expand scenarios into explicit tests first.',
      );
    }
  }

  const tests = Array.isArray(testSuite.tests) ? testSuite.tests : [];
  if (
    validationSplit === undefined ||
    validationSplit <= VALIDATION_SPLIT_MIN ||
    tests.length < 2
  ) {
    return {
      searchTestSuite: testSuite,
      searchTestCount: countConfiguredOptimizationTests(testSuite),
      validationTestCount: 0,
    };
  }

  const validationTestCount = Math.min(
    tests.length - 1,
    Math.max(1, Math.round(tests.length * validationSplit)),
  );
  const searchTestCount = tests.length - validationTestCount;
  return {
    searchTestSuite: {
      ...testSuite,
      tests: tests.slice(0, searchTestCount),
    },
    validationTestSuite: {
      ...testSuite,
      tests: tests.slice(searchTestCount),
    },
    searchTestCount,
    validationTestCount,
  };
}

function validateOptimizationOptions(options: PromptOptimizationOptions): void {
  for (const [name, value] of [
    ['promptIndex', options.promptIndex],
    ['providerIndex', options.providerIndex],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }

  if (options.validationSplit === undefined) {
    return;
  }
  if (
    !Number.isFinite(options.validationSplit) ||
    options.validationSplit <= VALIDATION_SPLIT_MIN ||
    options.validationSplit > VALIDATION_SPLIT_MAX
  ) {
    throw new Error(
      `validationSplit must be a number greater than ${VALIDATION_SPLIT_MIN} and less than or equal to ${VALIDATION_SPLIT_MAX}.`,
    );
  }
}

function availableIndexRange(count: number): string {
  return count > 0 ? `0-${count - 1}` : 'none';
}

function createSelectedOptimizationTestSuite(
  testSuite: TestSuite,
  options: PromptOptimizationOptions,
): TestSuite {
  const promptIndex = options.promptIndex ?? DEFAULT_SELECTION_INDEX;
  const providerIndex = options.providerIndex ?? DEFAULT_SELECTION_INDEX;
  const selectedPrompt = testSuite.prompts[promptIndex];
  if (!selectedPrompt) {
    throw new Error(
      `Prompt index ${promptIndex} is out of range. Available prompt indices: ${availableIndexRange(
        testSuite.prompts.length,
      )}.`,
    );
  }

  const selectedProvider = testSuite.providers[providerIndex];
  if (!selectedProvider) {
    throw new Error(
      `Provider index ${providerIndex} is out of range. Available provider indices: ${availableIndexRange(
        testSuite.providers.length,
      )}.`,
    );
  }

  const providerKey = selectedProvider.label || selectedProvider.id();
  const allowedPrompts = testSuite.providerPromptMap?.[providerKey];
  if (!isPromptAllowed(selectedPrompt, allowedPrompts)) {
    throw new Error(
      `Prompt index ${promptIndex} is not configured for provider index ${providerIndex}.`,
    );
  }

  logger.info(`Optimizing prompt index ${promptIndex} against provider index ${providerIndex}.`);

  return {
    ...testSuite,
    prompts: [selectedPrompt],
    providers: [selectedProvider],
  };
}

function extendPromptFilter(
  allowedPrompts: string[] | undefined,
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidateLabels: string[],
): string[] | undefined {
  if (!Array.isArray(allowedPrompts) || !isPromptAllowed(routingPrompt, allowedPrompts)) {
    return allowedPrompts;
  }

  return Array.from(
    new Set(
      [
        ...allowedPrompts,
        routingPrompt.label,
        routingPrompt.id,
        seedPrompt.label,
        seedPrompt.id,
        ...candidateLabels,
      ].filter(Boolean) as string[],
    ),
  );
}

function buildCandidateProviderPromptMap(
  testSuite: TestSuite,
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidateLabels: string[],
): TestSuite['providerPromptMap'] {
  if (!testSuite.providerPromptMap || Object.keys(testSuite.providerPromptMap).length === 0) {
    return testSuite.providerPromptMap;
  }

  return Object.fromEntries(
    Object.entries(testSuite.providerPromptMap).map(([providerId, labels]) => {
      return [
        providerId,
        extendPromptFilter(labels, routingPrompt, seedPrompt, candidateLabels) ?? labels,
      ];
    }),
  );
}

function buildCandidateTests(
  tests: TestSuite['tests'],
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidateLabels: string[],
): TestSuite['tests'] {
  if (!tests) {
    return tests;
  }

  return tests.map((test) => ({
    ...test,
    prompts: extendPromptFilter(test.prompts, routingPrompt, seedPrompt, candidateLabels),
  }));
}

function buildCandidateDefaultTest(
  defaultTest: TestSuite['defaultTest'],
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidateLabels: string[],
): TestSuite['defaultTest'] {
  if (!defaultTest || typeof defaultTest !== 'object') {
    return defaultTest;
  }

  return {
    ...defaultTest,
    prompts: extendPromptFilter(defaultTest.prompts, routingPrompt, seedPrompt, candidateLabels),
  };
}

function buildCandidateScenarios(
  scenarios: TestSuite['scenarios'],
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidateLabels: string[],
): TestSuite['scenarios'] {
  return scenarios?.map((scenario) => ({
    ...scenario,
    config: scenario.config.map((test) =>
      isScenarioConfigValuesRef(test)
        ? test
        : {
            ...test,
            prompts: extendPromptFilter(test.prompts, routingPrompt, seedPrompt, candidateLabels),
          },
    ),
    tests: scenario.tests.map((test) => ({
      ...test,
      prompts: extendPromptFilter(test.prompts, routingPrompt, seedPrompt, candidateLabels),
    })),
  }));
}

function createCandidateTestSuite(
  testSuite: TestSuite,
  routingPrompt: Prompt,
  seedPrompt: Prompt,
  candidates: PromptOptimizationCandidate[],
): TestSuite {
  const candidatePrompts: Prompt[] = candidates.map((candidate, index) => {
    const prompt = {
      ...seedPrompt,
      raw: candidate.prompt,
      label: `${seedPrompt.label || 'prompt'} [optimized ${index + 1}]`,
    };
    return {
      ...prompt,
      id: generateIdFromPrompt(prompt),
    };
  });
  const candidateLabels = candidatePrompts
    .map((prompt) => prompt.label)
    .filter(Boolean) as string[];

  return {
    ...testSuite,
    prompts: [seedPrompt, ...candidatePrompts],
    providerPromptMap: buildCandidateProviderPromptMap(
      testSuite,
      routingPrompt,
      seedPrompt,
      candidateLabels,
    ),
    tests: buildCandidateTests(testSuite.tests, routingPrompt, seedPrompt, candidateLabels),
    defaultTest: buildCandidateDefaultTest(
      testSuite.defaultTest,
      routingPrompt,
      seedPrompt,
      candidateLabels,
    ),
    scenarios: buildCandidateScenarios(
      testSuite.scenarios,
      routingPrompt,
      seedPrompt,
      candidateLabels,
    ),
  };
}

function cloneTestCaseForOptimization<T extends Record<string, unknown>>(testCase: T): T {
  const cloned: Record<string, unknown> = { ...testCase };

  if (Array.isArray(testCase.assert)) {
    cloned.assert = testCase.assert.map((assertion) =>
      assertion && typeof assertion === 'object' ? { ...assertion } : assertion,
    );
  }
  if (testCase.options && typeof testCase.options === 'object') {
    cloned.options = { ...(testCase.options as Record<string, unknown>) };
  }
  if (testCase.metadata && typeof testCase.metadata === 'object') {
    cloned.metadata = { ...(testCase.metadata as Record<string, unknown>) };
  }
  if (testCase.vars && typeof testCase.vars === 'object') {
    cloned.vars = { ...(testCase.vars as Record<string, unknown>) };
  }
  if (Array.isArray(testCase.prompts)) {
    cloned.prompts = [...testCase.prompts];
  }
  if (Array.isArray(testCase.providers)) {
    cloned.providers = [...testCase.providers];
  }

  return cloned as T;
}

function cloneScenarioForOptimization(
  scenario: NonNullable<TestSuite['scenarios']>[number],
): NonNullable<TestSuite['scenarios']>[number] {
  return {
    ...scenario,
    config: scenario.config.map((testCase) =>
      cloneTestCaseForOptimization(testCase as Record<string, unknown>),
    ) as typeof scenario.config,
    tests: scenario.tests.map((testCase) =>
      cloneTestCaseForOptimization(testCase as Record<string, unknown>),
    ) as typeof scenario.tests,
  };
}

function cloneOptimizationTestSuite(testSuite: TestSuite): TestSuite {
  const defaultTest =
    testSuite.defaultTest && typeof testSuite.defaultTest === 'object'
      ? (cloneTestCaseForOptimization(
          testSuite.defaultTest as Record<string, unknown>,
        ) as TestSuite['defaultTest'])
      : testSuite.defaultTest;

  return {
    ...testSuite,
    defaultTest,
    tests: testSuite.tests?.map((testCase) =>
      cloneTestCaseForOptimization(testCase as Record<string, unknown>),
    ) as TestSuite['tests'],
    scenarios: testSuite.scenarios?.map(cloneScenarioForOptimization),
  };
}

/**
 * Detects whether `defaultTest` carries enough configuration to be a runnable test
 * on its own. `promptfoo eval` synthesizes a single implicit `[{}]` test case when no
 * `tests` or `scenarios` are configured and merges `defaultTest` into it (see
 * `getInitialTests` in `src/evaluator.ts`), so a `defaultTest` with assertions
 * or variables produces one runnable row. An assertion scoring function only
 * combines assertion results, so a default-only implicit test that configures
 * one without assertions is rejected rather than silently ignoring the scorer.
 * An empty `defaultTest` (`{}`) carries nothing to evaluate and is not counted.
 */
function hasRunnableDefaultTest(defaultTest: TestSuite['defaultTest']): boolean {
  if (!defaultTest || typeof defaultTest !== 'object') {
    return false;
  }
  const hasAssertions = Array.isArray(defaultTest.assert) && defaultTest.assert.length > 0;
  const hasVars = Boolean(defaultTest.vars) && Object.keys(defaultTest.vars ?? {}).length > 0;
  if (defaultTest.assertScoringFunction && !hasAssertions) {
    return false;
  }
  return hasAssertions || hasVars;
}

function countConfiguredOptimizationTests(testSuite: TestSuite): number {
  const explicitTests = testSuite.tests?.length || 0;
  const scenarioTests = (testSuite.scenarios || []).reduce((count, scenario) => {
    const scenarioConfigCount = scenario.config.length;
    const scenarioTestCount = scenario.tests?.length ?? 1;
    return count + scenarioConfigCount * scenarioTestCount;
  }, 0);
  // `eval` synthesizes one implicit `[{}]` test (merging `defaultTest`) only
  // when there are no `tests` and `scenarios` is absent — an empty `scenarios`
  // array still suppresses it (see `getInitialTests` in `src/evaluator.ts`).
  // Mirror that exactly so the preflight does not accept testless configs.
  if (
    explicitTests === 0 &&
    !testSuite.scenarios &&
    hasRunnableDefaultTest(testSuite.defaultTest)
  ) {
    return 1;
  }
  return explicitTests + scenarioTests;
}

function createEvaluationOptions(config: Partial<UnifiedConfig>): InternalEvaluateOptions {
  return {
    ...config.evaluateOptions,
    cache: false,
    eventSource: 'library',
    showProgressBar: false,
    silent: true,
  };
}

function assertOptimizationEvalHasResults(evalRecord: Eval | undefined, scope: string): void {
  if (evalRecord?.results.length === 0) {
    throw new Error(
      `No eval test cases ran for ${scope} — check filters and other test scoping options.`,
    );
  }
}

export async function optimizePromptTestSuite(
  config: Partial<UnifiedConfig>,
  testSuite: TestSuite,
  options: PromptOptimizationOptions = {},
): Promise<PromptOptimizationResult> {
  validateOptimizationOptions(options);
  if (testSuite.prompts.length === 0) {
    throw new Error('Prompt optimization requires at least one configured prompt.');
  }
  if (countConfiguredOptimizationTests(testSuite) === 0) {
    throw new Error('Prompt optimization requires at least one configured test or scenario.');
  }

  const selectedTestSuite = createSelectedOptimizationTestSuite(testSuite, options);
  if (selectedTestSuite.prompts[0].function) {
    throw new Error('Prompt optimization currently supports literal string prompts only.');
  }
  const { searchTestSuite, validationTestSuite, searchTestCount, validationTestCount } =
    createValidationPartition(selectedTestSuite, options.validationSplit);

  // Internal optimizer evals are intermediate runs and must not write to the user's
  // configured output. Strip outputPath so the Evaluator does not append baseline or
  // candidate result rows to a .jsonl file the user expects only `eval` to populate.
  const optimizationConfig: Partial<UnifiedConfig> = { ...config, outputPath: undefined };

  logger.info('Running baseline evaluation for prompt optimization...');
  const baselineEval = await evaluate(
    cloneOptimizationTestSuite(searchTestSuite),
    new Eval(optimizationConfig, { persisted: false }),
    createEvaluationOptions(config),
  );
  assertOptimizationEvalHasResults(baselineEval, 'the selected prompt/provider');
  const baselineValidationEval = validationTestSuite
    ? await evaluate(
        cloneOptimizationTestSuite(validationTestSuite),
        new Eval(optimizationConfig, { persisted: false }),
        createEvaluationOptions(config),
      )
    : undefined;
  assertOptimizationEvalHasResults(baselineValidationEval, 'the validation split');
  const { searchPrompt: baselinePrompt, validationPrompt: baselineValidationPrompt } =
    selectBestPromptPair({
      searchPrompts: baselineEval.prompts,
      validationPrompts: baselineValidationEval?.prompts,
    });
  const baselinePromptIndex = findPromptIndex(baselineEval.prompts, baselinePrompt);
  const baselineSourcePrompt = searchTestSuite.prompts[baselinePromptIndex];
  if (!baselineSourcePrompt || typeof baselineSourcePrompt.raw !== 'string') {
    throw new Error('Prompt optimization currently supports string prompts only.');
  }

  const baselineResults = baselineEval.results
    .map(toEvaluateResult)
    .filter((result) => result.promptIdx === baselinePromptIndex);
  let currentFailures = baselineResults
    .filter((result) => !result.success)
    .slice(0, MAX_FAILURE_EXAMPLES);
  let currentSuccesses = baselineResults
    .filter((result) => result.success)
    .slice(0, MAX_SUCCESS_EXAMPLES);
  let currentPrompt = baselinePrompt;
  let currentValidationPrompt = baselineValidationPrompt;
  let currentPromptSource = baselineSourcePrompt;
  const history: PromptOptimizationHistoryItem[] = [
    {
      failures: createOptimizationExamples(currentFailures),
      prompt: baselineSourcePrompt.raw,
      score: scoreOf(baselinePrompt),
    },
  ];
  const rounds: PromptOptimizationRound[] = [];
  let currentEval = baselineEval;
  let currentValidationEval = baselineValidationEval;
  let allCandidates: PromptOptimizationCandidate[] = [];

  logger.info(
    `Selected baseline prompt "${baselinePrompt.label}" with score ${formatScore(baselinePrompt)}.`,
  );

  for (let round = 1; round <= DEFAULT_ROUNDS; round += 1) {
    const candidates = await generateRoundCandidatesOrStop(round, {
      prompt: currentPromptSource.raw,
      failures: currentFailures,
      successes: currentSuccesses,
      history,
    });
    // Later rounds frequently fail to produce *new* candidates as the prompt
    // converges, or on a transient provider error. Don't discard the
    // improvements already adopted in earlier rounds: stop and return the best
    // prompt found so far (a first-round failure rethrows inside the helper).
    if (candidates === null) {
      break;
    }
    allCandidates = [...allCandidates, ...candidates];

    logger.info(
      `Evaluating ${candidates.length} optimized prompt candidate(s) in round ${round}...`,
    );
    const candidateSearchSuite = createCandidateTestSuite(
      searchTestSuite,
      baselineSourcePrompt,
      currentPromptSource,
      candidates,
    );
    const candidateEval = await evaluate(
      cloneOptimizationTestSuite(candidateSearchSuite),
      new Eval(optimizationConfig, { persisted: false }),
      createEvaluationOptions(config),
    );
    const candidateValidationEval = validationTestSuite
      ? await evaluate(
          cloneOptimizationTestSuite(
            createCandidateTestSuite(
              validationTestSuite,
              baselineSourcePrompt,
              currentPromptSource,
              candidates,
            ),
          ),
          new Eval(optimizationConfig, { persisted: false }),
          createEvaluationOptions(config),
        )
      : undefined;
    const { searchPrompt: roundBestPrompt, validationPrompt: roundBestValidationPrompt } =
      selectBestPromptPair({
        searchPrompts: candidateEval.prompts,
        validationPrompts: candidateValidationEval?.prompts,
      });
    const previousScore = scoreOf(currentPrompt);
    let roundImproved = scoreOf(roundBestPrompt) > previousScore;
    let shouldAdopt = roundImproved;
    if (currentValidationPrompt && roundBestValidationPrompt) {
      const roundBestValidationScore = scoreOf(roundBestValidationPrompt);
      const previousValidationScore = scoreOf(currentValidationPrompt);
      roundImproved =
        roundBestValidationScore > previousValidationScore ||
        (roundBestValidationScore === previousValidationScore &&
          scoreOf(roundBestPrompt) > previousScore);
      shouldAdopt = roundImproved;
    }

    if (shouldAdopt) {
      currentPrompt = roundBestPrompt;
      currentValidationPrompt = roundBestValidationPrompt;
      currentEval = candidateEval;
      currentValidationEval = candidateValidationEval;
      currentPromptSource = {
        ...currentPromptSource,
        raw: roundBestPrompt.raw,
        label: roundBestPrompt.label,
      };
      const chosenPromptIndex = findPromptIndex(candidateEval.prompts, roundBestPrompt);
      const chosenResults = candidateEval.results
        .map(toEvaluateResult)
        .filter((result) => result.promptIdx === chosenPromptIndex);
      currentFailures = chosenResults
        .filter((result) => !result.success)
        .slice(0, MAX_FAILURE_EXAMPLES);
      currentSuccesses = chosenResults
        .filter((result) => result.success)
        .slice(0, MAX_SUCCESS_EXAMPLES);
    }

    history.push({
      failures: createOptimizationExamples(currentFailures),
      prompt: currentPromptSource.raw,
      score: scoreOf(currentPrompt),
    });
    rounds.push({
      round,
      candidateEval,
      candidateValidationEval,
      candidates,
      chosenPrompt: currentPrompt,
      chosenValidationPrompt: currentValidationPrompt,
      improved: roundImproved,
    });
  }

  const bestPrompt = currentPrompt;
  const bestValidationPrompt = currentValidationPrompt;
  const improved =
    baselineValidationPrompt && bestValidationPrompt
      ? scoreOf(bestValidationPrompt) > scoreOf(baselineValidationPrompt) ||
        (scoreOf(bestValidationPrompt) === scoreOf(baselineValidationPrompt) &&
          scoreOf(bestPrompt) > scoreOf(baselinePrompt))
      : scoreOf(bestPrompt) > scoreOf(baselinePrompt);

  logOptimizationOutcome({
    improved,
    baselinePrompt,
    bestPrompt,
    baselineValidationPrompt,
    bestValidationPrompt,
  });

  return {
    baselineEval,
    candidateEval: currentEval,
    baselinePrompt,
    baselineValidationEval,
    baselineValidationPrompt,
    bestPrompt,
    bestValidationEval: currentValidationEval,
    bestValidationPrompt,
    candidates: allCandidates,
    improved,
    rounds,
    searchTestCount,
    validationSplit: validationTestCount > 0 ? options.validationSplit : undefined,
    validationTestCount,
  };
}
