import * as fsPromises from 'fs/promises';

import { XMLBuilder } from 'fast-xml-parser';
import { ResultFailureReason } from '../types';

import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { EvaluateResult, GradingResult } from '../types';

const MAX_JUNIT_NAME_LENGTH = 512;
const MAX_JUNIT_MESSAGE_LENGTH = 1024;
const MAX_JUNIT_DETAIL_LENGTH = 8192;
const JUNIT_ASSERTION_FAILURE_MESSAGE = 'Assertion failed';
const JUNIT_EVALUATION_ERROR_MESSAGE = 'Evaluation error';
const SUITE_PROVIDER_SEPARATOR = '\u0001';
const SUITE_KEY_SEPARATOR = '\u0000';

type JunitProjectedResult = Pick<
  EvaluateResult,
  | 'description'
  | 'error'
  | 'failureReason'
  | 'gradingResult'
  | 'latencyMs'
  | 'prompt'
  | 'promptId'
  | 'promptIdx'
  | 'provider'
  | 'score'
  | 'success'
  | 'testCase'
  | 'testIdx'
>;

type JunitSuite = {
  displayName: string;
  errors: number;
  failures: number;
  skipped: number;
  testcases: { testIdx: number; testcase: Record<string, unknown> }[];
  tests: number;
  timeMs: number;
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeInlineText(
  value: string | undefined,
  fallback: string,
  maxLength = MAX_JUNIT_NAME_LENGTH,
): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return truncateText(normalized || fallback, maxLength);
}

function formatDurationSeconds(durationMs: number | undefined): string {
  const safeDurationMs =
    typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs > 0
      ? durationMs
      : 0;
  return Number((safeDurationMs / 1000).toFixed(3)).toString();
}

function getEvaluationTimestamp(evalRecord: Eval): string | undefined {
  const date = new Date(evalRecord.createdAt);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// Prefer the human-friendly label and fall back to the canonical id so
// providers that share an `id` but use distinct `label`s remain distinguishable.
function getProviderName(result: JunitProjectedResult): string {
  return normalizeInlineText(result.provider.label || result.provider.id, 'unknown provider');
}

function getSuiteKey(result: JunitProjectedResult): string {
  // Distinguish providers that share an id but differ by label (and vice versa)
  // so multi-target redteam runs do not collapse into a single suite.
  const providerKey = `${result.provider.id ?? ''}${SUITE_PROVIDER_SEPARATOR}${result.provider.label ?? ''}`;
  const promptKey = result.promptId || `prompt-index:${result.promptIdx}`;
  return `${providerKey}${SUITE_KEY_SEPARATOR}${promptKey}`;
}

function getTestCaseName(result: JunitProjectedResult): string {
  const prefix = `test ${result.testIdx + 1}`;
  const description = normalizeInlineText(result.description || result.testCase.description, '');
  return description ? `${prefix}: ${description}` : prefix;
}

function getFailedComponentResults(
  gradingResult: GradingResult | null | undefined,
): GradingResult[] {
  return gradingResult?.componentResults?.filter((component) => !component.pass) ?? [];
}

function getAssertionLabel(gradingResult: GradingResult): string {
  return gradingResult.assertion?.type ?? 'assertion';
}

function getFailureMessage(): string {
  return normalizeInlineText(undefined, JUNIT_ASSERTION_FAILURE_MESSAGE, MAX_JUNIT_MESSAGE_LENGTH);
}

function getErrorMessage(): string {
  return normalizeInlineText(undefined, JUNIT_EVALUATION_ERROR_MESSAGE, MAX_JUNIT_MESSAGE_LENGTH);
}

function getFailedAssertionLabels(gradingResult: GradingResult | null | undefined): string[] {
  const failedComponents = getFailedComponentResults(gradingResult);
  if (failedComponents.length > 0) {
    return failedComponents.map(getAssertionLabel);
  }
  return gradingResult ? [getAssertionLabel(gradingResult)] : [];
}

function getFailureDetails(result: JunitProjectedResult): string {
  const lines = [`Score: ${result.score}`, `Reason: ${getFailureMessage()}`];
  const failedAssertionLabels = getFailedAssertionLabels(result.gradingResult);

  if (failedAssertionLabels.length > 0) {
    lines.push('Failed assertions:');
    for (const label of failedAssertionLabels) {
      lines.push(`- ${label}`);
    }
  }

  return truncateText(lines.join('\n'), MAX_JUNIT_DETAIL_LENGTH);
}

function getErrorDetails(): string {
  return truncateText(`Reason: ${getErrorMessage()}`, MAX_JUNIT_DETAIL_LENGTH);
}

function projectEvalResult(result: EvalResult | EvaluateResult): JunitProjectedResult {
  if ('toEvaluateResult' in result) {
    const projected = result.toEvaluateResult();
    return {
      description: projected.description,
      error: projected.error,
      failureReason: projected.failureReason,
      gradingResult: projected.gradingResult,
      latencyMs: projected.latencyMs,
      prompt: projected.prompt,
      promptId: projected.promptId,
      promptIdx: projected.promptIdx,
      provider: projected.provider,
      score: projected.score,
      success: projected.success,
      testCase: projected.testCase,
      testIdx: projected.testIdx,
    };
  }

  return {
    description: result.description,
    error: result.error,
    failureReason: result.failureReason,
    gradingResult: result.gradingResult,
    latencyMs: result.latencyMs,
    prompt: result.prompt,
    promptId: result.promptId,
    promptIdx: result.promptIdx,
    provider: result.provider,
    score: result.score,
    success: result.success,
    testCase: result.testCase,
    testIdx: result.testIdx,
  };
}

async function* iterateJunitProjectedResults(
  evalRecord: Eval,
): AsyncGenerator<JunitProjectedResult> {
  if (evalRecord.useOldResults()) {
    const results = await evalRecord.getResults();
    for (const result of results) {
      yield projectEvalResult(result);
    }
    return;
  }

  if (!evalRecord.persisted) {
    for (const result of evalRecord.results) {
      yield projectEvalResult(result);
    }
    return;
  }

  for await (const batchResults of evalRecord.fetchResultsBatched()) {
    for (const result of batchResults) {
      yield projectEvalResult(result);
    }
  }
}

async function buildJunitSuites(evalRecord: Eval): Promise<JunitSuite[]> {
  const suites = new Map<string, JunitSuite>();
  // Assign each unique provider+prompt combination a stable 1-based ordinal so
  // the suite display name (and every contained testcase classname) match
  // regardless of which result happened to insert the suite first.
  const promptOrdinalsByProvider = new Map<string, Map<string, number>>();

  for await (const result of iterateJunitProjectedResults(evalRecord)) {
    const key = getSuiteKey(result);
    let suite = suites.get(key);
    if (!suite) {
      const providerName = getProviderName(result);
      const promptKey = result.promptId || `prompt-index:${result.promptIdx}`;
      let promptOrdinals = promptOrdinalsByProvider.get(providerName);
      if (!promptOrdinals) {
        promptOrdinals = new Map();
        promptOrdinalsByProvider.set(providerName, promptOrdinals);
      }
      let ordinal = promptOrdinals.get(promptKey);
      if (ordinal === undefined) {
        ordinal = promptOrdinals.size + 1;
        promptOrdinals.set(promptKey, ordinal);
      }
      suite = {
        displayName: `[${providerName}] prompt ${ordinal}`,
        errors: 0,
        failures: 0,
        skipped: 0,
        testcases: [],
        tests: 0,
        timeMs: 0,
      };
      suites.set(key, suite);
    }

    suite.testcases.push({
      testcase: buildJunitTestCase(result, suite.displayName),
      testIdx: result.testIdx,
    });
    suite.tests += 1;
    suite.timeMs += result.latencyMs;
    if (!result.success) {
      if (result.failureReason === ResultFailureReason.ASSERT) {
        suite.failures += 1;
      } else {
        suite.errors += 1;
      }
    }
  }

  return [...suites.values()];
}

function buildJunitTestCase(result: JunitProjectedResult, classname: string) {
  const testcase: Record<string, unknown> = {
    '@_classname': classname,
    '@_name': getTestCaseName(result),
    '@_time': formatDurationSeconds(result.latencyMs),
  };

  if (!result.success) {
    if (result.failureReason === ResultFailureReason.ASSERT) {
      testcase.failure = {
        '#text': getFailureDetails(result),
        '@_message': getFailureMessage(),
        '@_type': 'assertion',
      };
    } else {
      testcase.error = {
        '#text': getErrorDetails(),
        '@_message': getErrorMessage(),
        '@_type': 'error',
      };
    }
  }

  return testcase;
}

export async function createJunitXml(evalRecord: Eval): Promise<string> {
  const suites = await buildJunitSuites(evalRecord);
  const tests = suites.reduce((sum, suite) => sum + suite.tests, 0);
  const failures = suites.reduce((sum, suite) => sum + suite.failures, 0);
  const errors = suites.reduce((sum, suite) => sum + suite.errors, 0);
  const skipped = suites.reduce((sum, suite) => sum + suite.skipped, 0);
  const totalTimeMs = suites.reduce((sum, suite) => sum + suite.timeMs, 0);
  const timestamp = getEvaluationTimestamp(evalRecord);

  const xmlBuilder = new XMLBuilder({
    format: true,
    ignoreAttributes: false,
    indentBy: '  ',
  });

  return xmlBuilder.build({
    '?xml': {
      '@_version': '1.0',
      '@_encoding': 'UTF-8',
    },
    testsuites: {
      '@_errors': errors,
      '@_failures': failures,
      '@_name': 'promptfoo',
      '@_skipped': skipped,
      '@_tests': tests,
      '@_time': formatDurationSeconds(totalTimeMs),
      testsuite: suites.map((suite) => ({
        '@_errors': suite.errors,
        '@_failures': suite.failures,
        '@_name': suite.displayName,
        '@_skipped': suite.skipped,
        '@_tests': suite.tests,
        '@_time': formatDurationSeconds(suite.timeMs),
        ...(timestamp ? { '@_timestamp': timestamp } : {}),
        testcase: suite.testcases
          .sort((a, b) => a.testIdx - b.testIdx)
          .map(({ testcase }) => testcase),
      })),
    },
  });
}

export async function writeJunitXmlOutput(outputPath: string, evalRecord: Eval): Promise<void> {
  await fsPromises.writeFile(outputPath, await createJunitXml(evalRecord));
}
