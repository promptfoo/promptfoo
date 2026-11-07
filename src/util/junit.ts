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
  testcases: { testIdx: number; testcase: Record<string, unknown> }[];
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
  const projected = 'toEvaluateResult' in result ? result.toEvaluateResult() : result;

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
  const suites = new Map<
    string,
    JunitSuite & { providerKey: string; rawName: string; promptKey: string; promptIdx: number }
  >();
  const providersByDisplayName = new Map<string, Set<string>>();

  for await (const result of iterateJunitProjectedResults(evalRecord)) {
    const { provider } = result;
    const providerKey = JSON.stringify([provider.id ?? '', provider.label ?? '']);
    const promptKey = result.promptId || `prompt-index:${result.promptIdx}`;
    const key = JSON.stringify([providerKey, promptKey]);
    let suite = suites.get(key);
    if (!suite) {
      const rawName = provider.label || provider.id || '';
      const displayName = normalizeInlineText(rawName, 'unknown provider');
      const providers = providersByDisplayName.get(displayName) ?? new Set<string>();
      providers.add(providerKey);
      providersByDisplayName.set(displayName, providers);
      suite = {
        providerKey,
        rawName,
        promptKey,
        promptIdx: result.promptIdx,
        displayName: '',
        errors: 0,
        failures: 0,
        testcases: [],
        timeMs: 0,
      };
      suites.set(key, suite);
    }
    suite.promptIdx = Math.min(suite.promptIdx, result.promptIdx);

    suite.testcases.push({
      testcase: buildJunitTestCase(result),
      testIdx: result.testIdx,
    });
    suite.timeMs += result.latencyMs;
    if (!result.success) {
      if (result.failureReason === ResultFailureReason.ASSERT) {
        suite.failures += 1;
      } else {
        suite.errors += 1;
      }
    }
  }

  // Finalize names after collecting collisions, without reading stored results again.
  const promptCountsByProvider = new Map<string, number>();
  const orderedSuites = [...suites.values()].sort(
    (a, b) => a.promptIdx - b.promptIdx || a.promptKey.localeCompare(b.promptKey),
  );
  for (const suite of orderedSuites) {
    const baseName = normalizeInlineText(suite.rawName, 'unknown provider');
    const collision = (providersByDisplayName.get(baseName)?.size ?? 0) > 1;
    const suffix =
      collision || suite.rawName.search(INVALID_XML_CHARACTERS) !== -1
        ? ` (${sha256(suite.providerKey).slice(0, 16)})`
        : '';
    const providerName = normalizeInlineText(
      suite.rawName,
      'unknown provider',
      MAX_JUNIT_NAME_LENGTH - suffix.length,
    );
    const ordinal = (promptCountsByProvider.get(suite.providerKey) ?? 0) + 1;
    promptCountsByProvider.set(suite.providerKey, ordinal);
    suite.displayName = `[${providerName}] prompt ${ordinal}${suffix}`;
    for (const { testcase } of suite.testcases) {
      testcase['@_classname'] = suite.displayName;
    }
  }

  return [...suites.values()];
}

function buildJunitTestCase(result: JunitProjectedResult) {
  const testcase: Record<string, unknown> = {
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
  const tests = suites.reduce((sum, suite) => sum + suite.testcases.length, 0);
  const failures = suites.reduce((sum, suite) => sum + suite.failures, 0);
  const errors = suites.reduce((sum, suite) => sum + suite.errors, 0);
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
      '@_skipped': 0,
      '@_tests': tests,
      '@_time': formatDurationSeconds(totalTimeMs),
      testsuite: suites.map((suite) => ({
        '@_errors': suite.errors,
        '@_failures': suite.failures,
        '@_name': suite.displayName,
        '@_skipped': 0,
        '@_tests': suite.testcases.length,
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
