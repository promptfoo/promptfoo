import { ResultFailureReason } from '../types/index';

import type {
  Assertion,
  AssertionSet,
  EvaluateResult,
  EvaluateSummaryV2,
  EvaluateSummaryV3,
  TestCase,
} from '../types/index';

/**
 * EvalPort interchange converters (promptfoo issue #10410).
 *
 * EvalPort (https://github.com/adhabnr-ux/evalport, Apache-2.0) is a portable,
 * framework-agnostic JSON format for LLM evaluation datasets: test cases,
 * graders, eval suites, and result sets. This module converts between
 * promptfoo's exported eval JSON (`promptfoo eval -o results.json`, i.e. the
 * `EvaluateSummaryV3` shape) and the EvalPort format, in both directions.
 *
 * Design notes, grounded in `src/types/index.ts`:
 * - A promptfoo `TestCase.vars` record maps to an EvalPort `TestCase.input`
 *   (flattened, since EvalPort input is a string or array of strings rather
 *   than a key-value map). The original `vars` are always preserved under
 *   `metadata.promptfoo.vars` so a round-trip is lossless.
 * - Each entry in a test's `assert` array maps to its own EvalPort grader.
 *   `assert-set` groups are expanded so no individual assertion's score is
 *   silently averaged away. Deterministic types map directly (`equals` ->
 *   `exact_match`, `contains`/`icontains` -> `contains`, `regex`/`starts-with`
 *   -> `regex`); `similar` and other embedding comparisons map to
 *   `semantic_similarity`; model-graded types (`llm-rubric`, `g-eval`,
 *   `model-graded-factuality`, `answer-relevance`, `context-faithfulness`,
 *   ...) map to `llm_judge`; everything else (arbitrary `javascript`,
 *   `python`, `webhook`, ... code) maps to `custom` with the original
 *   assertion preserved in params, since it has no portable representation.
 * - On the results side, `EvaluateResult.gradingResult` maps to EvalPort
 *   `GraderResult`s: a `componentResults` array (from `assert-set` grouping)
 *   maps to one `GraderResult` per component rather than being collapsed.
 * - `not-<type>` assertions keep their mapping but record `inverse: true` in
 *   grader metadata, since EvalPort has no negation primitive.
 */

export const EVALPORT_SPEC_VERSION = '1.0.0';
export const EVALPORT_RUNNER_NAME = 'promptfoo';

export interface EvalPortGrader {
  id: string;
  type: string;
  params?: Record<string, unknown>;
  weight?: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface EvalPortTestCase {
  id: string;
  input: string | string[];
  graders: (string | EvalPortGrader)[];
  expected_output?: string;
  context?: string[];
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface EvalPortSuite {
  version: string;
  id: string;
  test_cases: EvalPortTestCase[];
  name?: string;
  description?: string;
  graders: EvalPortGrader[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EvalPortGraderResult {
  grader_id: string;
  type: string;
  score: number | null;
  passed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface EvalPortResult {
  test_case_id: string;
  grader_results: EvalPortGraderResult[];
  passed: boolean;
  actual_output?: string;
  duration_ms?: number;
  attempt?: number;
  completed_at?: string;
  error?: {
    message: string;
    type: string;
  };
  metadata?: Record<string, unknown>;
}

export interface EvalPortResultSet {
  version: string;
  suite_id: string;
  run_id: string;
  started_at: string;
  results: EvalPortResult[];
  completed_at?: string;
  suite_version?: string;
  provider?: Record<string, unknown>;
  runner?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  group?: Record<string, unknown>;
  isolation?: string;
  metadata?: Record<string, unknown>;
}

export interface EvalPortValidation {
  valid: boolean;
  errors: string[];
}

export interface ToEvalPortSuiteOptions {
  suiteId: string;
  name?: string;
  description?: string;
}

export interface ToEvalPortResultSetOptions {
  suiteId: string;
  runId?: string;
  startedAt?: string;
  completedAt?: string;
  providerModel?: string;
  runnerVersion?: string;
  /** Passed through verbatim, e.g. `{ group_id, role, sequence }` for grouped comparisons. */
  group?: Record<string, unknown>;
}

export interface FromEvalPortResultSetOptions {
  suite?: EvalPortSuite;
  providerId?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

function valueToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'function') {
    return '[function]';
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.min(1, Math.max(0, score));
}

function stableKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const EXACT_MATCH_TYPES = new Set(['equals']);
const CONTAINS_TYPES = new Set(['contains', 'icontains']);
const REGEX_TYPES = new Set(['regex', 'starts-with']);
const SEMANTIC_TYPES = new Set([
  'similar',
  'similar:cosine',
  'similar:dot',
  'similar:euclidean',
  'bleu',
  'gleu',
  'rouge-n',
  'meteor',
  'levenshtein',
]);
const LLM_JUDGE_TYPES = new Set([
  'llm-rubric',
  'g-eval',
  'model-graded-closedqa',
  'model-graded-factuality',
  'answer-relevance',
  'context-faithfulness',
  'context-recall',
  'context-relevance',
  'factuality',
  'classifier',
  'moderation',
  'guardrails',
  'is-refusal',
  'search-rubric',
  'agent-rubric',
  'conversation-relevance',
]);

/** Reference-bearing assertion types whose value can seed `expected_output`. */
const REFERENCE_TYPES = new Set([
  ...EXACT_MATCH_TYPES,
  ...CONTAINS_TYPES,
  ...REGEX_TYPES,
  ...SEMANTIC_TYPES,
]);

interface SplitAssertionType {
  original: string;
  base: string;
  inverse: boolean;
}

function splitAssertionType(type: string): SplitAssertionType {
  if (type.startsWith('not-')) {
    return { original: type, base: type.slice(4), inverse: true };
  }
  return { original: type, base: type, inverse: false };
}

function serializableAssertionValue(value: unknown): unknown {
  if (typeof value === 'function') {
    return '[function]';
  }
  if (value === undefined) {
    return undefined;
  }
  try {
    JSON.parse(JSON.stringify(value) ?? 'null');
    return value;
  } catch {
    return valueToString(value);
  }
}

/**
 * Maps a single promptfoo assertion to an EvalPort grader definition.
 * `assert-set` entries must be expanded by the caller (see `flattenAssertions`).
 */
export function assertionToEvalPortGrader(assertion: Assertion, id: string): EvalPortGrader {
  const { original, base, inverse } = splitAssertionType(assertion.type);
  const valueString = assertion.value === undefined ? '' : valueToString(assertion.value);
  const weight = assertion.weight ?? 1;
  const description = `promptfoo ${original}${inverse ? ' (inverse)' : ''}`;
  const promptfooMeta: Record<string, unknown> = {
    assertionType: original,
    inverse,
    ...(assertion.metric !== undefined && { metric: assertion.metric }),
    ...(assertion.threshold !== undefined && { threshold: assertion.threshold }),
    ...(assertion.weight !== undefined && { weight: assertion.weight }),
  };

  if (EXACT_MATCH_TYPES.has(base)) {
    return {
      id,
      type: 'exact_match',
      params: { expected: valueString, ignore_case: false },
      weight,
      description,
      metadata: { promptfoo: promptfooMeta },
    };
  }
  if (CONTAINS_TYPES.has(base)) {
    return {
      id,
      type: 'contains',
      params: { substring: valueString, ignore_case: base === 'icontains' },
      weight,
      description,
      metadata: { promptfoo: promptfooMeta },
    };
  }
  if (REGEX_TYPES.has(base)) {
    return {
      id,
      type: 'regex',
      params: {
        pattern: base === 'starts-with' ? `^${escapeRegExp(valueString)}` : valueString,
      },
      weight,
      description,
      metadata: { promptfoo: promptfooMeta },
    };
  }
  if (SEMANTIC_TYPES.has(base)) {
    return {
      id,
      type: 'semantic_similarity',
      params: { threshold: assertion.threshold ?? 0.8 },
      weight,
      description,
      metadata: { promptfoo: promptfooMeta },
    };
  }
  if (LLM_JUDGE_TYPES.has(base)) {
    const providerModel =
      typeof assertion.provider === 'string' ? assertion.provider : 'promptfoo-default';
    const rubric =
      typeof assertion.rubricPrompt === 'string' && assertion.rubricPrompt !== ''
        ? assertion.rubricPrompt
        : valueString;
    const prompt =
      rubric.includes('{output}') || rubric.includes('{input}') || rubric.includes('{expected}')
        ? rubric
        : `${rubric}\n\nEvaluate the following output:\n{output}`;
    return {
      id,
      type: 'llm_judge',
      params: { model: providerModel, prompt },
      weight,
      description,
      metadata: { promptfoo: promptfooMeta },
    };
  }
  return {
    id,
    type: 'custom',
    params: {
      handler: `promptfoo:${original}`,
      promptfoo: {
        ...promptfooMeta,
        value: serializableAssertionValue(assertion.value),
        ...(assertion.config !== undefined && isPlainRecord(assertion.config)
          ? { config: assertion.config }
          : {}),
      },
    },
    weight,
    description,
    metadata: { promptfoo: promptfooMeta },
  };
}

interface FlattenedAssertion {
  assertion: Assertion;
  /** Enclosing `assert-set` attribution, when expanded from one. */
  assertSet?: {
    metric?: string;
    threshold?: number;
  };
}

/** Recursively expands `assert-set` groups so each leaf assertion maps to its own grader. */
export function flattenAssertions(
  assertions: (Assertion | AssertionSet)[] | undefined,
): FlattenedAssertion[] {
  const out: FlattenedAssertion[] = [];
  for (const entry of assertions ?? []) {
    if (isPlainRecord(entry) && entry.type === 'assert-set' && Array.isArray(entry.assert)) {
      const nested = flattenAssertions(entry.assert as (Assertion | AssertionSet)[]);
      const metric = typeof entry.metric === 'string' ? entry.metric : undefined;
      const threshold = typeof entry.threshold === 'number' ? entry.threshold : undefined;
      for (const item of nested) {
        out.push({
          assertion: item.assertion,
          assertSet: {
            ...item.assertSet,
            ...(metric !== undefined && { metric }),
            ...(threshold !== undefined && { threshold }),
          },
        });
      }
    } else {
      out.push({ assertion: entry as Assertion });
    }
  }
  return out;
}

function varsToInput(vars: TestCase['vars']): string {
  if (!vars || !isPlainRecord(vars)) {
    return '';
  }
  const keys = Object.keys(vars);
  if (keys.length === 1 && typeof vars[keys[0]] === 'string') {
    return vars[keys[0]] as string;
  }
  return JSON.stringify(vars);
}

function testProviderId(test: TestCase): string | undefined {
  if (typeof test.provider === 'string') {
    return test.provider;
  }
  if (isPlainRecord(test.provider) && typeof test.provider.id === 'string') {
    return test.provider.id;
  }
  return undefined;
}

interface GraderDedupState {
  graders: EvalPortGrader[];
  graderIdByKey: Map<string, string>;
}

function resolveGraderId(draft: EvalPortGrader, state: GraderDedupState): string {
  const key = stableKey({ ...draft, id: undefined });
  const existing = state.graderIdByKey.get(key);
  if (existing) {
    return existing;
  }
  const graderId = `gr_${state.graders.length + 1}`;
  state.graderIdByKey.set(key, graderId);
  state.graders.push({ ...draft, id: graderId });
  return graderId;
}

function inferExpectedOutput(flat: FlattenedAssertion[]): string | undefined {
  for (const item of flat) {
    const { base } = splitAssertionType(item.assertion.type);
    if (REFERENCE_TYPES.has(base) && item.assertion.value !== undefined) {
      const candidate = valueToString(item.assertion.value);
      if (candidate !== '' && candidate !== '[function]') {
        return candidate;
      }
    }
  }
  return undefined;
}

function varsContext(vars: TestCase['vars']): string[] | undefined {
  const contextValue = isPlainRecord(vars) ? vars.context : undefined;
  return Array.isArray(contextValue) && contextValue.every((entry) => typeof entry === 'string')
    ? (contextValue as string[])
    : undefined;
}

function convertTestToEvalPortTestCase(
  test: TestCase,
  index: number,
  state: GraderDedupState,
): EvalPortTestCase {
  const testCaseId = `tc_${index + 1}`;
  const flat = flattenAssertions(test.assert);
  const graderIds = flat.map((item) => {
    const draft = assertionToEvalPortGrader(item.assertion, 'gr_pending');
    if (item.assertSet?.metric !== undefined) {
      const meta = isPlainRecord(draft.metadata?.promptfoo)
        ? (draft.metadata.promptfoo as Record<string, unknown>)
        : {};
      draft.metadata = {
        ...draft.metadata,
        promptfoo: { ...meta, assertSet: item.assertSet },
      };
    }
    return resolveGraderId(draft, state);
  });

  const expectedOutput = inferExpectedOutput(flat);
  const context = varsContext(test.vars);
  const varsRecord = isPlainRecord(test.vars) ? test.vars : undefined;
  const providerId = testProviderId(test);
  return {
    id: testCaseId,
    input: varsToInput(test.vars),
    graders: graderIds,
    ...(expectedOutput !== undefined && { expected_output: expectedOutput }),
    ...(context !== undefined && { context }),
    metadata: {
      promptfoo: {
        ...(varsRecord !== undefined && { vars: varsRecord }),
        ...(test.description !== undefined && { description: test.description }),
        ...(test.threshold !== undefined && { threshold: test.threshold }),
        ...(providerId !== undefined && { provider: providerId }),
        ...(test.metadata !== undefined && { testMetadata: test.metadata }),
      },
    },
  };
}

/**
 * Converts promptfoo test cases (e.g. `config.tests`) to an EvalPort suite.
 * Suite-level graders are deduplicated; test cases reference them by ID.
 */
export function promptfooTestsToEvalPortSuite(
  tests: TestCase[],
  options: ToEvalPortSuiteOptions,
): EvalPortSuite {
  const state: GraderDedupState = { graders: [], graderIdByKey: new Map<string, string>() };
  const testCases = tests.map((test, index) => convertTestToEvalPortTestCase(test, index, state));

  return {
    version: EVALPORT_SPEC_VERSION,
    id: options.suiteId,
    test_cases: testCases,
    ...(options.name !== undefined && { name: options.name }),
    ...(options.description !== undefined && { description: options.description }),
    graders: state.graders,
    metadata: {
      exportedBy: EVALPORT_RUNNER_NAME,
      exportedAt: new Date().toISOString(),
    },
  };
}

function codeGraderToAssertion(params: Record<string, unknown>): Assertion | undefined {
  const language = typeof params.language === 'string' ? params.language : undefined;
  const source = typeof params.source === 'string' ? params.source : '';
  if (language === 'python') {
    return { type: 'python', value: source };
  }
  if (language === 'javascript') {
    return { type: 'javascript', value: source };
  }
  return undefined;
}

/**
 * Best-effort mapping for graders that were not exported from promptfoo.
 * Framework-native types with no promptfoo equivalent return `undefined` so
 * the caller preserves them in metadata instead of fabricating an assertion.
 */
function graderToPromptfooAssertion(
  grader: EvalPortGrader,
  expectedOutput: string | undefined,
): Assertion | undefined {
  const promptfooMeta = isPlainRecord(grader.metadata?.promptfoo)
    ? (grader.metadata.promptfoo as Record<string, unknown>)
    : undefined;
  // Lossless path: this grader was exported from promptfoo, so the original
  // assertion is recorded in metadata.
  if (promptfooMeta !== undefined && typeof promptfooMeta.assertionType === 'string') {
    const params = isPlainRecord(grader.params?.promptfoo)
      ? (grader.params.promptfoo as Record<string, unknown>)
      : undefined;
    const storedValue = params?.value;
    return {
      type: promptfooMeta.assertionType as Assertion['type'],
      ...(storedValue !== undefined && storedValue !== '[function]'
        ? { value: storedValue as Assertion['value'] }
        : {}),
      ...(typeof promptfooMeta.threshold === 'number' && { threshold: promptfooMeta.threshold }),
      ...(typeof promptfooMeta.metric === 'string' && { metric: promptfooMeta.metric }),
      ...(typeof promptfooMeta.weight === 'number' && { weight: promptfooMeta.weight }),
    };
  }
  // Foreign framework-native grader with no promptfoo equivalent: import
  // the test without a fabricated assertion (preserved in test metadata).
  return foreignGraderToAssertion(grader, expectedOutput);
}

function foreignGraderToAssertion(
  grader: EvalPortGrader,
  expectedOutput: string | undefined,
): Assertion | undefined {
  const params = isPlainRecord(grader.params) ? grader.params : {};
  switch (grader.type) {
    case 'exact_match':
      return {
        type: 'equals',
        value: typeof params.expected === 'string' ? params.expected : (expectedOutput ?? ''),
      };
    case 'contains':
      return {
        type: params.ignore_case === true ? 'icontains' : 'contains',
        value: typeof params.substring === 'string' ? params.substring : (expectedOutput ?? ''),
      };
    case 'regex':
      return {
        type: 'regex',
        value: typeof params.pattern === 'string' ? params.pattern : '',
      };
    case 'semantic_similarity':
      return {
        type: 'similar',
        ...(expectedOutput !== undefined && { value: expectedOutput }),
        ...(typeof params.threshold === 'number' && { threshold: params.threshold }),
      };
    case 'llm_judge':
    case 'model graded':
      return {
        type: 'llm-rubric',
        value: typeof params.prompt === 'string' ? params.prompt : '',
      };
    case 'json_schema':
      return { type: 'is-json' };
    case 'human':
      return { type: 'human' };
    case 'code':
      return codeGraderToAssertion(params);
    default:
      return undefined;
  }
}

/**
 * Converts an EvalPort suite to promptfoo test cases runnable via `eval`.
 * Framework-native graders without a promptfoo equivalent are preserved under
 * `metadata.promptfoo.evalportGraders` rather than fabricated.
 */
export function evalPortSuiteToPromptfooTests(suite: EvalPortSuite): TestCase[] {
  const gradersById = new Map<string, EvalPortGrader>();
  for (const grader of suite.graders ?? []) {
    if (grader && typeof grader.id === 'string') {
      gradersById.set(grader.id, grader);
    }
  }
  return (suite.test_cases ?? []).map((testCase) => {
    const promptfooMeta = isPlainRecord(testCase.metadata?.promptfoo)
      ? (testCase.metadata.promptfoo as Record<string, unknown>)
      : undefined;
    const vars =
      promptfooMeta !== undefined && isPlainRecord(promptfooMeta.vars)
        ? (promptfooMeta.vars as TestCase['vars'])
        : {
            input:
              typeof testCase.input === 'string' ? testCase.input : JSON.stringify(testCase.input),
          };
    const assertions: Assertion[] = [];
    const unmapped: unknown[] = [];
    for (const ref of testCase.graders ?? []) {
      const grader = typeof ref === 'string' ? gradersById.get(ref) : ref;
      if (!grader) {
        continue;
      }
      const assertion = graderToPromptfooAssertion(grader, testCase.expected_output);
      if (assertion) {
        assertions.push(assertion);
      } else {
        unmapped.push({ id: grader.id, type: grader.type, params: grader.params ?? {} });
      }
    }
    return {
      ...(typeof promptfooMeta?.description === 'string' && {
        description: promptfooMeta.description,
      }),
      vars,
      ...(assertions.length > 0 && { assert: assertions }),
      ...(typeof promptfooMeta?.threshold === 'number' && { threshold: promptfooMeta.threshold }),
      ...((promptfooMeta?.testMetadata !== undefined || unmapped.length > 0) && {
        metadata: {
          ...(isPlainRecord(promptfooMeta?.testMetadata)
            ? (promptfooMeta.testMetadata as Record<string, unknown>)
            : {}),
          ...(unmapped.length > 0 && { evalportGraders: unmapped }),
        },
      }),
    };
  });
}

function responseToString(response: EvaluateResult['response']): string | undefined {
  const output = response?.output;
  if (output === undefined || output === null) {
    return undefined;
  }
  if (typeof output === 'string') {
    return output;
  }
  return valueToString(output);
}

interface ExpandedGradingResult {
  pass: boolean;
  score: number | null;
  reason: string;
  assertionType?: string;
  metric?: string;
}

/** Expands one grading result: `componentResults` become one entry each, never collapsed. */
function expandGradingResult(
  gradingResult: EvaluateResult['gradingResult'],
  fallback: { pass: boolean; score: number },
): ExpandedGradingResult[] {
  if (!gradingResult) {
    return [
      {
        pass: fallback.pass,
        score: Number.isFinite(fallback.score) ? clampScore(fallback.score) : null,
        reason: 'No grading result recorded.',
      },
    ];
  }
  const components = gradingResult.componentResults;
  if (components && components.length > 0) {
    return components.map((component) => ({
      pass: component.pass,
      score: Number.isFinite(component.score) ? clampScore(component.score) : null,
      reason: component.reason,
      ...(component.assertion?.type !== undefined && { assertionType: component.assertion.type }),
      ...(component.assertion?.metric !== undefined && { metric: component.assertion.metric }),
    }));
  }
  return [
    {
      pass: gradingResult.pass,
      score: Number.isFinite(gradingResult.score) ? clampScore(gradingResult.score) : null,
      reason: gradingResult.reason,
      ...(gradingResult.assertion?.type !== undefined && {
        assertionType: gradingResult.assertion.type,
      }),
      ...(gradingResult.assertion?.metric !== undefined && {
        metric: gradingResult.assertion.metric,
      }),
    },
  ];
}

function expandedToGraderType(expanded: ExpandedGradingResult, graderId: string): string {
  if (expanded.assertionType === undefined) {
    return 'custom';
  }
  try {
    return assertionToEvalPortGrader(
      { type: expanded.assertionType as Assertion['type'] },
      graderId,
    ).type;
  } catch {
    return 'custom';
  }
}

/**
 * Converts evaluated results (e.g. `summary.results` from an exported
 * `EvaluateSummaryV3`) to an EvalPort result set.
 */
export function evaluateResultsToEvalPortResultSet(
  results: EvaluateResult[],
  options: ToEvalPortResultSetOptions,
): EvalPortResultSet {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const evalPortResults: EvalPortResult[] = results.map((result, index) => {
    const testCaseId = `tc_${result.testIdx >= 0 ? result.testIdx + 1 : index + 1}`;
    const expanded = expandGradingResult(result.gradingResult, {
      pass: result.success,
      score: result.score,
    });
    const graderResults: EvalPortGraderResult[] = expanded.map((item, componentIdx) => {
      const graderId = `${testCaseId}_g${componentIdx + 1}`;
      // Per EvalPort rule 6, a null score means "not verified" and must not
      // read as a scored failure.
      const passed = item.score === null ? false : item.pass;
      return {
        grader_id: graderId,
        type: expandedToGraderType(item, graderId),
        score: item.score,
        passed,
        reason: item.reason,
        metadata: {
          promptfoo: {
            ...(item.assertionType !== undefined && { assertionType: item.assertionType }),
            ...(item.metric !== undefined && { metric: item.metric }),
            ...(item.score === null && { unverified: true }),
          },
        },
      };
    });

    const actualOutput = responseToString(result.response);
    return {
      test_case_id: testCaseId,
      grader_results: graderResults,
      passed: result.success,
      ...(actualOutput !== undefined && { actual_output: actualOutput }),
      ...(Number.isFinite(result.latencyMs) && { duration_ms: result.latencyMs }),
      ...(typeof result.error === 'string' &&
        result.error !== '' && {
          error: {
            message: result.error,
            type:
              result.failureReason === ResultFailureReason.ERROR
                ? 'provider_error'
                : 'runner_error',
          },
        }),
      metadata: {
        promptfoo: {
          promptIdx: result.promptIdx,
          testIdx: result.testIdx,
          providerId: result.provider?.id,
          ...(result.provider?.label !== undefined && { providerLabel: result.provider.label }),
          namedScores: result.namedScores ?? {},
          failureReason: result.failureReason,
          ...(result.cost !== undefined && { cost: result.cost }),
        },
      },
    };
  });

  const numericScores = evalPortResults.flatMap((result) =>
    result.grader_results
      .map((graderResult) => graderResult.score)
      .filter((score): score is number => typeof score === 'number'),
  );
  const passedCount = evalPortResults.filter((result) => result.passed).length;
  const providerIds = [...new Set(results.map((result) => result.provider?.id).filter(Boolean))];
  const byGrader: Record<string, { passed: number; failed: number; avg_score: number }> = {};
  for (const result of evalPortResults) {
    for (const graderResult of result.grader_results) {
      const entry = byGrader[graderResult.grader_id] ?? { passed: 0, failed: 0, avg_score: 0 };
      if (graderResult.passed) {
        entry.passed += 1;
      } else {
        entry.failed += 1;
      }
      if (typeof graderResult.score === 'number') {
        const count = entry.passed + entry.failed;
        entry.avg_score += (graderResult.score - entry.avg_score) / count;
      }
      byGrader[graderResult.grader_id] = entry;
    }
  }

  return {
    version: EVALPORT_SPEC_VERSION,
    suite_id: options.suiteId,
    run_id: options.runId ?? `run_${startedAt}`,
    started_at: startedAt,
    results: evalPortResults,
    ...(options.completedAt !== undefined && { completed_at: options.completedAt }),
    ...((options.providerModel !== undefined || providerIds.length === 1) && {
      provider: { model: options.providerModel ?? providerIds[0] },
    }),
    runner: {
      name: EVALPORT_RUNNER_NAME,
      ...(options.runnerVersion !== undefined && { version: options.runnerVersion }),
    },
    ...(options.group !== undefined && { group: options.group }),
    summary: {
      total: evalPortResults.length,
      passed: passedCount,
      failed: evalPortResults.length - passedCount,
      skipped: 0,
      pass_rate: evalPortResults.length > 0 ? passedCount / evalPortResults.length : 0,
      avg_score:
        numericScores.length > 0
          ? numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length
          : 0,
      duration_ms: evalPortResults.reduce((sum, result) => sum + (result.duration_ms ?? 0), 0),
      by_grader: byGrader,
    },
  };
}

/** Converts a full exported eval summary (`EvaluateSummaryV3`/`V2`) to an EvalPort result set. */
export function evaluateSummaryToEvalPortResultSet(
  summary: EvaluateSummaryV3 | EvaluateSummaryV2,
  options: ToEvalPortResultSetOptions,
): EvalPortResultSet {
  return evaluateResultsToEvalPortResultSet(summary.results, {
    ...options,
    startedAt: options.startedAt ?? summary.timestamp,
  });
}

/**
 * Converts an EvalPort result set back to promptfoo `EvaluateResult`s (e.g. for
 * comparison views). Pass `suite` to restore original `vars`; otherwise vars
 * carry the test-case id for traceability.
 */
export function evalPortResultSetToEvaluateResults(
  resultSet: EvalPortResultSet,
  options?: FromEvalPortResultSetOptions,
): EvaluateResult[] {
  const suiteTests = options?.suite ? evalPortSuiteToPromptfooTests(options.suite) : undefined;
  const varsByTestCaseId = new Map<string, TestCase['vars']>();
  if (options?.suite && suiteTests) {
    options.suite.test_cases.forEach((testCase, index) => {
      varsByTestCaseId.set(testCase.id, suiteTests[index]?.vars);
    });
  }
  return resultSet.results.map((result, index) => {
    const numericScores = result.grader_results
      .map((graderResult) => graderResult.score)
      .filter((score): score is number => typeof score === 'number');
    const score =
      numericScores.length > 0
        ? numericScores.reduce((sum, s) => sum + s, 0) / numericScores.length
        : result.passed
          ? 1
          : 0;
    const namedScores: Record<string, number> = {};
    for (const graderResult of result.grader_results) {
      if (typeof graderResult.score === 'number') {
        namedScores[graderResult.grader_id] = graderResult.score;
      }
    }
    return {
      promptIdx: 0,
      testIdx: index,
      testCase: {
        description: result.test_case_id,
        vars: varsByTestCaseId.get(result.test_case_id) ?? {},
      },
      promptId: `evalport:${result.test_case_id}`,
      provider: {
        id:
          options?.providerId ??
          (typeof resultSet.provider?.model === 'string' ? resultSet.provider.model : 'evalport'),
      },
      prompt: { raw: result.test_case_id, label: 'evalport-import' },
      vars: varsByTestCaseId.get(result.test_case_id) ?? {},
      ...(result.actual_output !== undefined && {
        response: { output: result.actual_output },
      }),
      ...(result.error !== undefined && { error: result.error.message }),
      failureReason:
        result.error === undefined
          ? result.passed
            ? ResultFailureReason.NONE
            : ResultFailureReason.ASSERT
          : ResultFailureReason.ERROR,
      success: result.passed,
      score,
      latencyMs: result.duration_ms ?? 0,
      gradingResult: {
        pass: result.passed,
        score,
        reason: `Imported EvalPort result for ${result.test_case_id}.`,
        namedScores,
        componentResults: result.grader_results.map((graderResult) => ({
          pass: graderResult.passed,
          score: typeof graderResult.score === 'number' ? graderResult.score : 0,
          reason: graderResult.reason ?? '',
          metadata: {
            evalport: {
              graderId: graderResult.grader_id,
              type: graderResult.type,
            },
          },
        })),
      },
      namedScores,
      metadata: {
        evalport: {
          suiteId: resultSet.suite_id,
          runId: resultSet.run_id,
          testCaseId: result.test_case_id,
        },
      },
    };
  });
}

const WELL_KNOWN_GRADER_TYPES = new Set([
  'exact_match',
  'contains',
  'regex',
  'semantic_similarity',
  'llm_judge',
  'json_schema',
  'json_path',
  'code',
  'human',
  'model graded',
  'custom',
]);

function checkGrader(grader: unknown, context: string, errors: string[]): void {
  if (!isPlainRecord(grader)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  if (typeof grader.id !== 'string' || grader.id === '') {
    errors.push(`${context} must have a non-empty string id.`);
  }
  if (typeof grader.type !== 'string' || grader.type === '') {
    errors.push(`${context} must have a non-empty string type.`);
    return;
  }
  const params = isPlainRecord(grader.params) ? grader.params : {};
  if (!WELL_KNOWN_GRADER_TYPES.has(grader.type) && typeof params.handler !== 'string') {
    errors.push(
      `${context} uses framework-specific type "${grader.type}" and must set params.handler.`,
    );
  }
  switch (grader.type) {
    case 'contains':
      if (typeof params.substring !== 'string' || params.substring === '') {
        errors.push(`${context} of type "contains" requires a non-empty params.substring.`);
      }
      break;
    case 'regex':
      if (typeof params.pattern !== 'string' || params.pattern === '') {
        errors.push(`${context} of type "regex" requires a non-empty params.pattern.`);
      }
      break;
    case 'semantic_similarity':
      if (typeof params.threshold !== 'number' || params.threshold < 0 || params.threshold > 1) {
        errors.push(
          `${context} of type "semantic_similarity" requires params.threshold in [0, 1].`,
        );
      }
      break;
    case 'llm_judge':
    case 'model graded':
      if (typeof params.model !== 'string' || typeof params.prompt !== 'string') {
        errors.push(
          `${context} of type "llm_judge" requires params.model and params.prompt strings.`,
        );
      } else if (
        !params.prompt.includes('{output}') &&
        !params.prompt.includes('{input}') &&
        !params.prompt.includes('{expected}')
      ) {
        errors.push(
          `${context} of type "llm_judge" params.prompt must contain {output}, {input}, or {expected}.`,
        );
      }
      break;
    case 'code':
      if (typeof params.language !== 'string' || typeof params.source !== 'string') {
        errors.push(`${context} of type "code" requires params.language and params.source.`);
      }
      break;
    default:
      break;
  }
}

/** Structural validation of an EvalPort suite (schemas + referential integrity). */
export function validateEvalPortSuite(suite: unknown): EvalPortValidation {
  const errors: string[] = [];
  if (!isPlainRecord(suite)) {
    return { valid: false, errors: ['Suite must be an object.'] };
  }
  if (typeof suite.version !== 'string' || suite.version === '') {
    errors.push('Suite must have a non-empty string version.');
  }
  if (typeof suite.id !== 'string' || suite.id === '') {
    errors.push('Suite must have a non-empty string id.');
  }
  if (!Array.isArray(suite.test_cases) || suite.test_cases.length === 0) {
    errors.push('Suite must have a non-empty test_cases array.');
    return { valid: errors.length === 0, errors };
  }
  const graderDefs = Array.isArray(suite.graders) ? suite.graders : [];
  const graderIds = new Set<string>();
  for (const grader of graderDefs) {
    checkGrader(grader, 'Suite grader', errors);
    if (isPlainRecord(grader) && typeof grader.id === 'string') {
      if (graderIds.has(grader.id)) {
        errors.push(`Duplicate suite grader id "${grader.id}".`);
      }
      graderIds.add(grader.id);
    }
  }
  const testCaseIds = new Set<string>();
  suite.test_cases.forEach((testCase: unknown, index: number) => {
    const context = `Test case at index ${index}`;
    if (!isPlainRecord(testCase)) {
      errors.push(`${context} must be an object.`);
      return;
    }
    if (typeof testCase.id !== 'string' || testCase.id === '') {
      errors.push(`${context} must have a non-empty string id.`);
    } else {
      if (testCaseIds.has(testCase.id)) {
        errors.push(`Duplicate test case id "${testCase.id}".`);
      }
      testCaseIds.add(testCase.id);
    }
    if (typeof testCase.input !== 'string' && !Array.isArray(testCase.input)) {
      errors.push(`${context} must have a string or array input.`);
    }
    if (!Array.isArray(testCase.graders)) {
      errors.push(`${context} must have a graders array.`);
      return;
    }
    for (const ref of testCase.graders) {
      if (typeof ref === 'string') {
        if (!graderIds.has(ref)) {
          errors.push(`${context} references unknown grader "${ref}".`);
        }
      } else {
        checkGrader(ref, `${context} inline grader`, errors);
      }
    }
  });
  return { valid: errors.length === 0, errors };
}

function checkGraderResultEntry(graderResult: unknown, context: string, errors: string[]): void {
  if (!isPlainRecord(graderResult)) {
    errors.push(`${context} has a grader result that must be an object.`);
    return;
  }
  if (typeof graderResult.grader_id !== 'string' || graderResult.grader_id === '') {
    errors.push(`${context} has a grader result with a missing grader_id.`);
  }
  if (typeof graderResult.type !== 'string' || graderResult.type === '') {
    errors.push(`${context} has a grader result with a missing type.`);
  }
  const score: unknown = graderResult.score;
  if (score !== null && (typeof score !== 'number' || score < 0 || score > 1)) {
    errors.push(`${context} has a grader result score outside [0, 1].`);
  }
  if (typeof graderResult.passed !== 'boolean') {
    errors.push(`${context} has a grader result with a non-boolean passed.`);
  }
}

function checkResultSetEntry(
  result: unknown,
  index: number,
  seenKeys: Set<string>,
  errors: string[],
): void {
  const context = `Result at index ${index}`;
  if (!isPlainRecord(result)) {
    errors.push(`${context} must be an object.`);
    return;
  }
  if (typeof result.test_case_id !== 'string' || result.test_case_id === '') {
    errors.push(`${context} must have a non-empty string test_case_id.`);
  }
  if (typeof result.passed !== 'boolean') {
    errors.push(`${context} must have a boolean passed.`);
  }
  const key =
    typeof result.attempt === 'number'
      ? `${String(result.test_case_id)}#${String(result.attempt)}`
      : String(result.test_case_id);
  if (seenKeys.has(key)) {
    errors.push(`Duplicate result key "${key}".`);
  }
  seenKeys.add(key);
  if (!Array.isArray(result.grader_results) || result.grader_results.length === 0) {
    errors.push(`${context} must have a non-empty grader_results array.`);
    return;
  }
  for (const graderResult of result.grader_results) {
    checkGraderResultEntry(graderResult, context, errors);
  }
}

/** Structural validation of an EvalPort result set (schemas + score ranges). */
export function validateEvalPortResultSet(resultSet: unknown): EvalPortValidation {
  const errors: string[] = [];
  if (!isPlainRecord(resultSet)) {
    return { valid: false, errors: ['ResultSet must be an object.'] };
  }
  for (const field of ['version', 'suite_id', 'run_id', 'started_at']) {
    if (typeof resultSet[field] !== 'string' || resultSet[field] === '') {
      errors.push(`ResultSet must have a non-empty string ${field}.`);
    }
  }
  if (!Array.isArray(resultSet.results) || resultSet.results.length === 0) {
    errors.push('ResultSet must have a non-empty results array.');
    return { valid: errors.length === 0, errors };
  }
  const seenKeys = new Set<string>();
  resultSet.results.forEach((result: unknown, index: number) => {
    checkResultSetEntry(result, index, seenKeys, errors);
  });
  return { valid: errors.length === 0, errors };
}
