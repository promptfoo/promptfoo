import * as fsPromises from 'fs/promises';

import { XMLBuilder } from 'fast-xml-parser';
import { ResultFailureReason } from '../types';
import { sha256 } from './createHash';

import type Eval from '../models/eval';
import type EvalResult from '../models/evalResult';
import type { EvaluateResult, GradingResult } from '../types';

const MAX_JUNIT_NAME_LENGTH = 512;
const MAX_JUNIT_DETAIL_LENGTH = 8192;
const JUNIT_ASSERTION_FAILURE_MESSAGE = 'Assertion failed';
const JUNIT_EVALUATION_ERROR_MESSAGE = 'Evaluation error';
const INVALID_XML_CHARACTERS = /[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu;

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
  const cutoff = maxLength - 3;
  const end = (value.codePointAt(cutoff - 1) ?? 0) > 0xffff ? cutoff + 1 : cutoff;
  return `${value.slice(0, end)}...`;
}

function normalizeInlineText(
  value: string | undefined,
  fallback: string,
  maxLength = MAX_JUNIT_NAME_LENGTH,
): string {
  // Collapse whitespace first so forbidden whitespace (vertical tab, form feed)
  // separates words instead of joining them, then drop what XML rejects and
  // collapse again to close the gaps it left behind. Sanitizing before
  // truncating keeps the visible text as long as the limit allows.
  const sanitized = (value ?? '')
    .replace(/\s+/g, ' ')
    .replace(INVALID_XML_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim();
  return truncateText(sanitized || fallback, maxLength);
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

function getFailedAssertionLabels(gradingResult: GradingResult | null | undefined): string[] {
  const failedComponents = getFailedComponentResults(gradingResult);
  if (failedComponents.length > 0) {
    return failedComponents.map(getAssertionLabel);
  }
  return gradingResult ? [getAssertionLabel(gradingResult)] : [];
}

function getFailureDetails(result: JunitProjectedResult): string {
  const lines = [`Score: ${result.score}`, `Reason: ${JUNIT_ASSERTION_FAILURE_MESSAGE}`];
  const failedAssertionLabels = getFailedAssertionLabels(result.gradingResult);

  if (failedAssertionLabels.length > 0) {
    lines.push('Failed assertions:');
    for (const label of failedAssertionLabels) {
      lines.push(`- ${label}`);
    }
  }

  return truncateText(
    lines.join('\n').replace(INVALID_XML_CHARACTERS, ''),
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
    const { provider } = result;
    const providerKey = JSON.stringify([provider.id ?? '', provider.label ?? '']);
    const promptKey = result.promptId || `prompt-index:${result.promptIdx}`;
    const key = JSON.stringify([providerKey, promptKey]);
    let suite = suites.get(key);
    if (!suite) {
      const rawName = provider.label || provider.id || '';
      // Every forbidden character is erased from the rendered name, wherever it
      // sits and even when it is whitespace that collapses into a plain space,
      // so two providers can render identically. Keep them apart with a stable
      // hash of the provider identity.
      const suffix =
        rawName.search(INVALID_XML_CHARACTERS) === -1
          ? ''
          : ` (${sha256(providerKey).slice(0, 16)})`;
      const providerName = normalizeInlineText(
        rawName,
        'unknown provider',
        MAX_JUNIT_NAME_LENGTH - suffix.length,
      );
      const ordinalKey = suffix ? providerKey : JSON.stringify([providerName]);
      let promptOrdinals = promptOrdinalsByProvider.get(ordinalKey);
      if (!promptOrdinals) {
        promptOrdinals = new Map();
        promptOrdinalsByProvider.set(ordinalKey, promptOrdinals);
      }
      let ordinal = promptOrdinals.get(promptKey);
      if (ordinal === undefined) {
        ordinal = promptOrdinals.size + 1;
        promptOrdinals.set(promptKey, ordinal);
      }
      suite = {
        displayName: `[${providerName}] prompt ${ordinal}${suffix}`,
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
        '@_message': JUNIT_ASSERTION_FAILURE_MESSAGE,
        '@_type': 'assertion',
      };
    } else {
      testcase.error = {
        '#text': `Reason: ${JUNIT_EVALUATION_ERROR_MESSAGE}`,
        '@_message': JUNIT_EVALUATION_ERROR_MESSAGE,
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

  const xml = xmlBuilder.build({
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

  return xml.replace(INVALID_XML_CHARACTERS, '');
}

export async function writeJunitXmlOutput(outputPath: string, evalRecord: Eval): Promise<void> {
  await fsPromises.writeFile(outputPath, await createJunitXml(evalRecord));
}
