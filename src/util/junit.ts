import * as fsPromises from 'fs/promises';

import { XMLBuilder } from 'fast-xml-parser';
import { ResultFailureReason } from '../types';

import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { EvaluateResult, GradingResult } from '../types';

const MAX_JUNIT_NAME_LENGTH = 512;
const MAX_JUNIT_MESSAGE_LENGTH = 1024;
const MAX_JUNIT_DETAIL_LENGTH = 8192;

type JunitProjectedResult = Pick<
  EvaluateResult,
  | 'description'
  | 'error'
  | 'failureReason'
  | 'gradingResult'
  | 'latencyMs'
  | 'prompt'
  | 'promptId'
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
  results: JunitProjectedResult[];
  skipped: number;
  tests: number;
  timeMs: number;
};

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function normalizeInlineText(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return truncateText(normalized || fallback, MAX_JUNIT_NAME_LENGTH);
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

function getProviderName(result: JunitProjectedResult): string {
  return normalizeInlineText(result.provider.id || result.provider.label, 'unknown provider');
}

function getPromptName(result: JunitProjectedResult): string {
  return normalizeInlineText(result.prompt.label || result.prompt.raw, 'unnamed prompt');
}

function getSuiteKey(result: JunitProjectedResult): string {
  return `${result.provider.id || result.provider.label || 'unknown provider'}\u0000${result.promptId}`;
}

function getSuiteDisplayName(result: JunitProjectedResult): string {
  return `[${getProviderName(result)}] ${getPromptName(result)}`;
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

function getFailureMessage(result: JunitProjectedResult): string {
  const message = result.gradingResult?.reason || result.error || 'Assertion failed';
  return truncateText(normalizeInlineText(message, 'Assertion failed'), MAX_JUNIT_MESSAGE_LENGTH);
}

function getErrorMessage(result: JunitProjectedResult): string {
  const message = result.error || result.gradingResult?.reason || 'Evaluation error';
  return truncateText(normalizeInlineText(message, 'Evaluation error'), MAX_JUNIT_MESSAGE_LENGTH);
}

function getFailureDetails(result: JunitProjectedResult): string {
  const lines = [`Score: ${result.score}`, `Reason: ${getFailureMessage(result)}`];
  const failedComponents = getFailedComponentResults(result.gradingResult);

  if (failedComponents.length > 0) {
    lines.push('Failed assertions:');
    for (const component of failedComponents) {
      lines.push(`- ${getAssertionLabel(component)}: ${component.reason}`);
    }
  }

  return truncateText(lines.join('\n'), MAX_JUNIT_DETAIL_LENGTH);
}

function getErrorDetails(result: JunitProjectedResult): string {
  return truncateText(
    [
      `Reason: ${getErrorMessage(result)}`,
      ...(result.error ? [`Error: ${result.error}`] : []),
    ].join('\n'),
    MAX_JUNIT_DETAIL_LENGTH,
  );
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
    provider: result.provider,
    score: result.score,
    success: result.success,
    testCase: result.testCase,
    testIdx: result.testIdx,
  };
}

async function getJunitProjectedResults(evalRecord: Eval): Promise<JunitProjectedResult[]> {
  if (evalRecord.useOldResults()) {
    const results = await evalRecord.getResults();
    return results.map((result) => projectEvalResult(result));
  }

  if (!evalRecord.persisted) {
    return evalRecord.results.map((result) => projectEvalResult(result));
  }

  const projectedResults: JunitProjectedResult[] = [];
  for await (const batchResults of evalRecord.fetchResultsBatched()) {
    projectedResults.push(...batchResults.map((result) => projectEvalResult(result)));
  }
  return projectedResults;
}

function buildJunitSuites(results: JunitProjectedResult[]): JunitSuite[] {
  const suites = new Map<string, JunitSuite>();

  for (const result of results) {
    const key = getSuiteKey(result);
    const suite = suites.get(key) ?? {
      displayName: getSuiteDisplayName(result),
      errors: 0,
      failures: 0,
      results: [],
      skipped: 0,
      tests: 0,
      timeMs: 0,
    };

    suite.results.push(result);
    suite.tests += 1;
    suite.timeMs += result.latencyMs;
    if (!result.success) {
      if (result.failureReason === ResultFailureReason.ASSERT) {
        suite.failures += 1;
      } else {
        suite.errors += 1;
      }
    }
    suites.set(key, suite);
  }

  return [...suites.values()];
}

function buildJunitTestCase(result: JunitProjectedResult) {
  const testcase: Record<string, unknown> = {
    '@_classname': getSuiteDisplayName(result),
    '@_name': getTestCaseName(result),
    '@_time': formatDurationSeconds(result.latencyMs),
  };

  if (!result.success) {
    if (result.failureReason === ResultFailureReason.ASSERT) {
      testcase.failure = {
        '#text': getFailureDetails(result),
        '@_message': getFailureMessage(result),
        '@_type': 'assertion',
      };
    } else {
      testcase.error = {
        '#text': getErrorDetails(result),
        '@_message': getErrorMessage(result),
        '@_type': 'error',
      };
    }
  }

  return testcase;
}

export async function createJunitXml(evalRecord: Eval): Promise<string> {
  const results = await getJunitProjectedResults(evalRecord);
  const suites = buildJunitSuites(results);
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
        testcase: suite.results
          .sort((a, b) => a.testIdx - b.testIdx)
          .map((result) => buildJunitTestCase(result)),
      })),
    },
  });
}

export async function writeJunitXmlOutput(outputPath: string, evalRecord: Eval): Promise<void> {
  await fsPromises.writeFile(outputPath, await createJunitXml(evalRecord));
}
