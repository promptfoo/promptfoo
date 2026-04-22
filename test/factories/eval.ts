import {
  type CompletedPrompt,
  type EvaluateResult,
  type EvaluateStats,
  type EvaluateSummaryV2,
  type EvaluateSummaryV3,
  type EvaluateTable,
  type EvaluateTableOutput,
  type EvaluateTableRow,
  type PromptMetrics,
  ResultFailureReason,
} from '../../src/types/index';
import { createGradingResult } from './gradingResult';
import { createProviderResponse, createRequiredTokenUsage, createTokenUsage } from './provider';
import { createAtomicTestCase, createPrompt } from './testSuite';

export function createPromptMetrics(overrides: Partial<PromptMetrics> = {}): PromptMetrics {
  return {
    score: 1,
    testPassCount: 1,
    testFailCount: 0,
    testErrorCount: 0,
    assertPassCount: 0,
    assertFailCount: 0,
    totalLatencyMs: 0,
    tokenUsage: createTokenUsage(),
    namedScores: {},
    namedScoresCount: {},
    cost: 0,
    ...overrides,
  };
}

export function createCompletedPrompt(
  raw = 'Test prompt',
  overrides: Partial<CompletedPrompt> = {},
): CompletedPrompt {
  // raw/label are resolved by createPrompt — pull them out of the override
  // spread so the remaining fields layer on top without clobbering the
  // derived label.
  const { raw: _rawOverride, label: _labelOverride, ...rest } = overrides;
  return {
    ...createPrompt(raw, overrides),
    provider: 'test-provider',
    metrics: createPromptMetrics(),
    ...rest,
  };
}

export function createEvaluateResult(overrides: Partial<EvaluateResult> = {}): EvaluateResult {
  // prompt and promptId are derived together — promptId defaults to the
  // prompt's raw value unless the caller supplies one. Pull both out of the
  // override spread so the remaining fields layer on top without having to
  // re-pin them afterward.
  const { prompt: promptOverride, promptId: promptIdOverride, ...rest } = overrides;
  const prompt = promptOverride ?? createPrompt();
  return {
    promptIdx: 0,
    testIdx: 0,
    testCase: createAtomicTestCase(),
    provider: { id: 'test-provider' },
    vars: {},
    response: createProviderResponse(),
    failureReason: ResultFailureReason.NONE,
    success: true,
    score: 1,
    latencyMs: 0,
    gradingResult: createGradingResult(),
    namedScores: {},
    cost: 0,
    tokenUsage: createRequiredTokenUsage(),
    ...rest,
    prompt,
    promptId: promptIdOverride ?? prompt.raw,
  };
}

export function createEvaluateStats(overrides: Partial<EvaluateStats> = {}): EvaluateStats {
  return {
    successes: 1,
    failures: 0,
    errors: 0,
    tokenUsage: createRequiredTokenUsage(),
    ...overrides,
  };
}

export function createEvaluateTableOutput(
  overrides: Partial<EvaluateTableOutput> = {},
): EvaluateTableOutput {
  return {
    cost: 0,
    failureReason: ResultFailureReason.NONE,
    gradingResult: createGradingResult(),
    id: 'test-output',
    latencyMs: 0,
    namedScores: {},
    pass: true,
    prompt: 'Test prompt',
    provider: 'test-provider',
    response: createProviderResponse(),
    score: 1,
    testCase: createAtomicTestCase(),
    text: 'Test output',
    tokenUsage: createTokenUsage(),
    ...overrides,
  };
}

export function createEvaluateTableRow(
  overrides: Partial<EvaluateTableRow> = {},
): EvaluateTableRow {
  return {
    outputs: [createEvaluateTableOutput()],
    vars: [],
    test: createAtomicTestCase(),
    testIdx: 0,
    ...overrides,
  };
}

export function createEvaluateTable(overrides: Partial<EvaluateTable> = {}): EvaluateTable {
  return {
    head: {
      prompts: [createCompletedPrompt()],
      vars: [],
    },
    body: [createEvaluateTableRow()],
    ...overrides,
  };
}

export function createEvaluateSummaryV3(
  overrides: Partial<EvaluateSummaryV3> = {},
): EvaluateSummaryV3 {
  return {
    version: 3,
    timestamp: new Date(0).toISOString(),
    results: [createEvaluateResult()],
    prompts: [createCompletedPrompt()],
    stats: createEvaluateStats(),
    ...overrides,
  };
}

export function createEvaluateSummaryV2(
  overrides: Partial<EvaluateSummaryV2> = {},
): EvaluateSummaryV2 {
  return {
    version: 2,
    timestamp: new Date(0).toISOString(),
    results: [createEvaluateResult()],
    table: createEvaluateTable(),
    stats: createEvaluateStats(),
    ...overrides,
  };
}
