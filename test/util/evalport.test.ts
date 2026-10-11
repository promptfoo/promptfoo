import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../src/types/index';
import {
  assertionToEvalPortGrader,
  evalPortResultSetToEvaluateResults,
  evalPortSuiteToPromptfooTests,
  evaluateResultsToEvalPortResultSet,
  evaluateSummaryToEvalPortResultSet,
  flattenAssertions,
  promptfooTestsToEvalPortSuite,
  validateEvalPortResultSet,
  validateEvalPortSuite,
} from '../../src/util/evalport';

import type { EvaluateResult, EvaluateSummaryV3, TestCase } from '../../src/types/index';
import type { EvalPortGrader, EvalPortResultSet, EvalPortSuite } from '../../src/util/evalport';

function makeResult(overrides: Partial<EvaluateResult> = {}): EvaluateResult {
  return {
    promptIdx: 0,
    testIdx: 0,
    testCase: { vars: { question: 'What is the capital of France?' } },
    promptId: 'prompt-1',
    provider: { id: 'openai:gpt-4o-mini' },
    prompt: { raw: 'What is the capital of {{question}}?', label: 'q' },
    vars: { question: 'What is the capital of France?' },
    response: { output: 'Paris' },
    failureReason: ResultFailureReason.NONE,
    success: true,
    score: 1,
    latencyMs: 120,
    gradingResult: {
      pass: true,
      score: 1,
      reason: 'All assertions passed.',
      namedScores: {},
    },
    namedScores: {},
    ...overrides,
  };
}

describe('evalport interchange', () => {
  describe('promptfooTestsToEvalPortSuite', () => {
    it('flattens a single string var to input and preserves vars for round-trip', () => {
      const tests: TestCase[] = [
        {
          description: 'capitals',
          vars: { question: 'What is the capital of France?' },
          assert: [{ type: 'equals', value: 'Paris' }],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 'my_eval' });
      expect(suite.id).toBe('my_eval');
      expect(suite.test_cases).toHaveLength(1);
      expect(suite.test_cases[0]?.input).toBe('What is the capital of France?');
      expect(suite.test_cases[0]?.expected_output).toBe('Paris');
      expect(suite.graders).toHaveLength(1);
      expect(suite.graders[0]?.type).toBe('exact_match');
      expect(validateEvalPortSuite(suite).valid).toBe(true);
    });

    it('serializes multi-key vars as JSON and keeps the original record in metadata', () => {
      const tests: TestCase[] = [
        {
          vars: { first: 'Ada', last: 'Lovelace' },
          assert: [{ type: 'contains', value: 'Ada' }],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.test_cases[0]?.input).toBe(JSON.stringify({ first: 'Ada', last: 'Lovelace' }));
      expect(suite.test_cases[0]?.metadata).toMatchObject({
        promptfoo: { vars: { first: 'Ada', last: 'Lovelace' } },
      });
      expect(suite.graders[0]).toMatchObject({
        type: 'contains',
        params: { substring: 'Ada', ignore_case: false },
      });
    });

    it('maps the documented assertion families', () => {
      const tests: TestCase[] = [
        {
          vars: { q: 'a' },
          assert: [
            { type: 'icontains', value: 'Hi' },
            { type: 'regex', value: '^hi' },
            { type: 'starts-with', value: 'hi' },
            { type: 'similar', value: 'hello', threshold: 0.9 },
            { type: 'llm-rubric', value: 'Is the tone friendly? {output}' },
            { type: 'javascript', value: 'output.length > 0' },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      const types = suite.graders.map((grader) => grader.type);
      expect(types).toEqual([
        'contains',
        'regex',
        'regex',
        'semantic_similarity',
        'llm_judge',
        'custom',
      ]);
      expect(suite.graders[0]?.params).toMatchObject({ ignore_case: true });
      expect(suite.graders[2]?.params).toMatchObject({ pattern: '^hi' });
      expect(suite.graders[3]?.params).toMatchObject({ threshold: 0.9 });
      expect(suite.graders[4]?.params).toMatchObject({ prompt: 'Is the tone friendly? {output}' });
      expect(suite.graders[5]?.params).toMatchObject({ handler: 'promptfoo:javascript' });
      expect(validateEvalPortSuite(suite).valid).toBe(true);
    });

    it('records negation honestly instead of inventing a negated grader', () => {
      const tests: TestCase[] = [
        { vars: { q: 'a' }, assert: [{ type: 'not-contains', value: 'secret' }] },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders[0]?.type).toBe('contains');
      expect(suite.graders[0]?.metadata).toMatchObject({
        promptfoo: { assertionType: 'not-contains', inverse: true },
      });
    });

    it('expands assert-set groups so each leaf assertion keeps its own grader', () => {
      const tests: TestCase[] = [
        {
          vars: { q: 'a' },
          assert: [
            {
              type: 'assert-set',
              assert: [
                { type: 'equals', value: 'x' },
                { type: 'contains', value: 'y', metric: 'has-y' },
              ],
            },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders.map((grader) => grader.type)).toEqual(['exact_match', 'contains']);
      expect(suite.test_cases[0]?.graders).toHaveLength(2);
    });

    it('deduplicates identical graders across test cases', () => {
      const tests: TestCase[] = [
        { vars: { q: 'a' }, assert: [{ type: 'equals', value: 'x' }] },
        { vars: { q: 'b' }, assert: [{ type: 'equals', value: 'x' }] },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders).toHaveLength(1);
      expect(suite.test_cases[0]?.graders).toEqual(suite.test_cases[1]?.graders);
    });
  });

  describe('suite round-trip', () => {
    it('restores vars and assertion types losslessly', () => {
      const tests: TestCase[] = [
        {
          description: 'capitals',
          vars: { question: 'Capital of France?', context: ['France is in Europe.'] },
          threshold: 0.8,
          assert: [
            { type: 'equals', value: 'Paris' },
            { type: 'similar', value: 'Paris', threshold: 0.9 },
            { type: 'llm-rubric', value: 'Correct capital? {output}' },
            { type: 'not-contains', value: 'London' },
            { type: 'javascript', value: 'output.length > 0' },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 'roundtrip' });
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored).toHaveLength(1);
      expect(restored[0]?.vars).toEqual(tests[0]?.vars);
      expect(restored[0]?.description).toBe('capitals');
      expect(restored[0]?.threshold).toBe(0.8);
      const restoredTypes = ((restored[0]?.assert ?? []) as { type: string }[]).map(
        (assertion) => assertion.type,
      );
      expect(restoredTypes).toEqual([
        'equals',
        'similar',
        'llm-rubric',
        'not-contains',
        'javascript',
      ]);
    });

    it('imports foreign graders without fabricating assertions', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [{ vars: { q: 'a' }, assert: [{ type: 'equals', value: 'x' }] }],
        { suiteId: 's' },
      );
      suite.graders.push({
        id: 'gr_foreign',
        type: 'trulens_feedback',
        params: { handler: 'trulens' },
      });
      suite.test_cases[0]?.graders.push('gr_foreign');
      expect(validateEvalPortSuite(suite).valid).toBe(true);
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toHaveLength(1);
      expect(restored[0]?.metadata).toMatchObject({
        evalportGraders: [{ id: 'gr_foreign', type: 'trulens_feedback' }],
      });
    });
  });

  describe('evaluateResultsToEvalPortResultSet', () => {
    it('expands componentResults to one GraderResult per component', () => {
      const results = [
        makeResult({
          testIdx: 0,
          gradingResult: {
            pass: false,
            score: 0.5,
            reason: '1 of 2 passed.',
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'equals passed.',
                assertion: { type: 'equals', value: 'Paris' },
              },
              {
                pass: false,
                score: 0,
                reason: 'contains failed.',
                assertion: { type: 'contains', value: 'France' },
              },
            ],
          },
          success: false,
          score: 0.5,
          failureReason: ResultFailureReason.ASSERT,
        }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 'my_eval',
        runId: 'run-1',
      });
      expect(resultSet.results).toHaveLength(1);
      expect(resultSet.results[0]?.grader_results).toHaveLength(2);
      expect(resultSet.results[0]?.grader_results.map((grader) => grader.type)).toEqual([
        'exact_match',
        'contains',
      ]);
      expect(resultSet.results[0]?.passed).toBe(false);
      expect(resultSet.results[0]?.actual_output).toBe('Paris');
      expect(resultSet.summary).toMatchObject({ total: 1, passed: 0, failed: 1 });
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('clamps out-of-range scores and maps errors', () => {
      const results = [
        makeResult({
          testIdx: 2,
          success: false,
          score: 0,
          error: 'provider timed out',
          failureReason: ResultFailureReason.ERROR,
          gradingResult: undefined,
        }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
      });
      expect(resultSet.results[0]?.test_case_id).toBe('tc_3');
      expect(resultSet.results[0]?.error).toMatchObject({
        message: 'provider timed out',
        type: 'provider_error',
      });
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('converts an exported EvaluateSummaryV3 using its timestamp', () => {
      const summary: EvaluateSummaryV3 = {
        version: 3,
        timestamp: '2026-01-15T10:30:00.000Z',
        results: [makeResult(), makeResult({ testIdx: 1, success: false, score: 0 })],
        prompts: [],
        stats: { successes: 1, failures: 1, errors: 0, tokenUsage: {} as never },
      };
      const resultSet = evaluateSummaryToEvalPortResultSet(summary, {
        suiteId: 's',
        runId: 'run-1',
      });
      expect(resultSet.started_at).toBe('2026-01-15T10:30:00.000Z');
      expect(resultSet.summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('assigns an attempt to repeated testIdx rows so the set stays valid', () => {
      // A real exported eval repeats testIdx across prompts/providers.
      const results = [
        makeResult({ testIdx: 0, promptIdx: 0, provider: { id: 'openai:gpt-5' } }),
        makeResult({ testIdx: 0, promptIdx: 1, provider: { id: 'openai:gpt-5-mini' } }),
        makeResult({ testIdx: 1, promptIdx: 0, provider: { id: 'openai:gpt-5' } }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
      });
      expect(resultSet.results.map((r) => [r.test_case_id, r.attempt])).toEqual([
        ['tc_1', 1],
        ['tc_1', 2],
        ['tc_2', undefined],
      ]);
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('reuses suite grader IDs when the suite is supplied', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [{ vars: { q: 'a' }, assert: [{ type: 'equals', value: 'Paris' }] }],
        { suiteId: 's' },
      );
      const suiteGraderId = suite.graders[0]?.id;
      const results = [
        makeResult({
          testIdx: 0,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'equals passed.',
            assertion: { type: 'equals', value: 'Paris' },
          },
        }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
        suite,
      });
      expect(resultSet.results[0]?.grader_results[0]?.grader_id).toBe(suiteGraderId);
      // The shared grader aggregates rather than being partitioned per test.
      expect(Object.keys(resultSet.summary?.by_grader ?? {})).toEqual([suiteGraderId]);
    });

    it('falls back to per-result grader IDs when no suite is supplied', () => {
      const resultSet = evaluateResultsToEvalPortResultSet(
        [
          makeResult({
            testIdx: 0,
            gradingResult: {
              pass: true,
              score: 1,
              reason: 'equals passed.',
              assertion: { type: 'equals', value: 'Paris' },
            },
          }),
        ],
        { suiteId: 's', runId: 'run-1' },
      );
      expect(resultSet.results[0]?.grader_results[0]?.grader_id).toMatch(/^tc_1_g\d$/);
    });
  });

  describe('result round-trip', () => {
    it('imports a result set back to EvaluateResults', () => {
      const resultSet = evaluateResultsToEvalPortResultSet([makeResult()], {
        suiteId: 's',
        runId: 'run-1',
      });
      const imported = evalPortResultSetToEvaluateResults(resultSet);
      expect(imported).toHaveLength(1);
      expect(imported[0]?.success).toBe(true);
      expect(imported[0]?.response).toMatchObject({ output: 'Paris' });
      expect(imported[0]?.gradingResult?.componentResults).toHaveLength(1);
    });

    it('restores the exported row identity instead of array position', () => {
      const resultSet = evaluateResultsToEvalPortResultSet(
        [
          makeResult({
            testIdx: 2,
            promptIdx: 1,
            provider: { id: 'openai:gpt-5-mini', label: 'gpt-5-mini' },
          }),
        ],
        { suiteId: 's', runId: 'run-1' },
      );
      const imported = evalPortResultSetToEvaluateResults(resultSet);
      expect(imported[0]?.testIdx).toBe(2);
      expect(imported[0]?.promptIdx).toBe(1);
      expect(imported[0]?.provider).toEqual({ id: 'openai:gpt-5-mini' });
    });
  });

  describe('validators', () => {
    it('rejects duplicates, dangling refs, and out-of-range scores', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [{ vars: { q: 'a' }, assert: [{ type: 'equals', value: 'x' }] }],
        { suiteId: 's' },
      );
      const dupe = {
        ...suite,
        test_cases: [...suite.test_cases, { ...suite.test_cases[0] }],
      };
      expect(validateEvalPortSuite(dupe).valid).toBe(false);

      const dangling = {
        ...suite,
        test_cases: [{ ...suite.test_cases[0], graders: ['gr_missing'] }],
      };
      expect(
        validateEvalPortSuite(dangling).errors.some((error) => error.includes('gr_missing')),
      ).toBe(true);

      const resultSet = evaluateResultsToEvalPortResultSet([makeResult()], {
        suiteId: 's',
        runId: 'run-1',
      });
      const badScore = {
        ...resultSet,
        results: [
          {
            ...resultSet.results[0],
            grader_results: [{ ...resultSet.results[0]?.grader_results[0], score: 2 }],
          },
        ],
      };
      expect(validateEvalPortResultSet(badScore).valid).toBe(false);
    });
  });

  describe('assertion value handling', () => {
    it('round-trips assertion values, thresholds, metrics, weights, and configs', () => {
      // Guards the reported `equals: Paris -> { type: "equals" }` data loss.
      const tests: TestCase[] = [
        {
          vars: { q: 'capital?' },
          assert: [
            {
              type: 'equals',
              value: 'Paris',
              threshold: 1,
              metric: 'exact',
              weight: 2,
              config: { locale: 'fr' },
            },
            { type: 'contains', value: 'Par' },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toEqual([
        {
          type: 'equals',
          value: 'Paris',
          config: { locale: 'fr' },
          threshold: 1,
          metric: 'exact',
          weight: 2,
        },
        { type: 'contains', value: 'Par' },
      ]);
    });

    it('handles number, boolean, and missing assertion values', () => {
      const tests: TestCase[] = [
        {
          vars: { q: 'a' },
          assert: [
            { type: 'equals', value: 42 },
            { type: 'equals', value: true as never },
            { type: 'equals' },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders.map((grader) => grader.params?.expected)).toEqual(['42', 'true', '']);
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toEqual([
        { type: 'equals', value: 42 },
        { type: 'equals', value: true },
        { type: 'equals' },
      ]);
    });

    it('drops function values instead of persisting their source', () => {
      const fnAssertion = {
        type: 'javascript',
        value: (() => true) as unknown as string,
      } as never;
      const grader = assertionToEvalPortGrader(fnAssertion, 'gr_1');
      expect(grader.params?.promptfoo).toMatchObject({ value: '[function]' });
      const suite = promptfooTestsToEvalPortSuite([{ vars: { q: 'a' }, assert: [fnAssertion] }], {
        suiteId: 's',
      });
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toEqual([{ type: 'javascript' }]);
    });

    it('stringifies non-serializable assertion values', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const grader = assertionToEvalPortGrader(
        { type: 'equals', value: circular } as never,
        'gr_1',
      );
      expect(grader.params?.expected).toBe('[object Object]');
    });

    it('escapes starts-with patterns and defaults similarity thresholds', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [
          {
            vars: { q: 'a' },
            assert: [
              { type: 'starts-with', value: 'a.b(c)' },
              { type: 'similar', value: 'hello' },
            ],
          },
        ],
        { suiteId: 's' },
      );
      expect(suite.graders[0]?.params?.pattern).toBe('^a\\.b\\(c\\)');
      expect(suite.graders[1]?.params).toMatchObject({ threshold: 0.8 });
      expect(validateEvalPortSuite(suite).valid).toBe(true);
    });

    it('defaults llm-judge models and completes placeholder-free rubrics', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [
          {
            vars: { q: 'a' },
            assert: [
              { type: 'llm-rubric', value: 'Rate it' },
              { type: 'g-eval', value: 'Score {output}', provider: 'openai:gpt-4o' },
            ],
          },
        ],
        { suiteId: 's' },
      );
      expect(suite.graders[0]?.params).toMatchObject({ model: 'promptfoo-default' });
      expect(suite.graders[0]?.params?.prompt).toContain('{output}');
      expect(suite.graders[1]?.params).toMatchObject({
        model: 'openai:gpt-4o',
        prompt: 'Score {output}',
      });
      expect(validateEvalPortSuite(suite).valid).toBe(true);
    });

    it('deduplicates array-valued custom graders via stable keys', () => {
      const tests: TestCase[] = [
        { vars: { q: 'a' }, assert: [{ type: 'webhook', value: ['x', 'y'] }] },
        { vars: { q: 'b' }, assert: [{ type: 'webhook', value: ['x', 'y'] }] },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders).toHaveLength(1);
    });

    it('passes through suite name and description options', () => {
      const suite = promptfooTestsToEvalPortSuite([{ vars: { q: 'a' } }], {
        suiteId: 's',
        name: 'Capitals',
        description: 'Capital cities eval',
      });
      expect(suite.name).toBe('Capitals');
      expect(suite.description).toBe('Capital cities eval');
    });

    it('flattenAssertions passes through non-assert-set entries', () => {
      expect(flattenAssertions(undefined)).toEqual([]);
      expect(
        flattenAssertions([{ type: 'equals', value: 'x' }] as never).map(
          (item) => item.assertion.type,
        ),
      ).toEqual(['equals']);
    });
  });

  describe('foreign suite import', () => {
    function foreignSuite(graders: EvalPortGrader[], expectedOutput?: string): EvalPortSuite {
      return {
        version: '1.0.0',
        id: 'foreign',
        test_cases: [
          {
            id: 'tc_1',
            input: 'say hi',
            ...(expectedOutput !== undefined && { expected_output: expectedOutput }),
            graders: graders.map((grader) => grader.id),
          },
        ],
        graders,
      };
    }

    it('maps foreign grader families without fabricating assertions', () => {
      const suite = foreignSuite([
        { id: 'g1', type: 'exact_match', params: {} },
        { id: 'g2', type: 'contains', params: { ignore_case: true } },
        { id: 'g3', type: 'contains', params: { substring: 'hi' } },
        { id: 'g4', type: 'regex', params: {} },
        { id: 'g5', type: 'semantic_similarity', params: {} },
        { id: 'g6', type: 'llm_judge', params: {} },
        { id: 'g7', type: 'json_schema', params: {} },
        { id: 'g8', type: 'human', params: {} },
        { id: 'g9', type: 'code', params: { language: 'python', source: 'print(1)' } },
        { id: 'g10', type: 'code', params: { language: 'javascript', source: '1' } },
        { id: 'g11', type: 'code', params: { language: 'ruby', source: 'x' } },
        { id: 'g12', type: 'weird', params: { handler: 'weird' } },
      ]);
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toEqual([
        { type: 'equals', value: '' },
        { type: 'icontains', value: '' },
        { type: 'contains', value: 'hi' },
        { type: 'regex', value: '' },
        { type: 'similar' },
        { type: 'llm-rubric', value: '' },
        { type: 'is-json' },
        { type: 'human' },
        { type: 'python', value: 'print(1)' },
        { type: 'javascript', value: '1' },
      ]);
      expect(restored[0]?.metadata).toMatchObject({
        evalportGraders: [{ id: 'g11' }, { id: 'g12' }],
      });
    });

    it('uses expected outputs and thresholds for foreign graders', () => {
      const suite = foreignSuite(
        [
          { id: 'g1', type: 'exact_match', params: { expected: 42 } },
          { id: 'g2', type: 'semantic_similarity', params: { threshold: 0.5 } },
          {
            id: 'g3',
            type: 'model graded',
            params: { model: 'openai:gpt-4o', prompt: 'Rate {output}' },
          },
        ],
        'hi',
      );
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toEqual([
        { type: 'equals', value: 'hi' },
        { type: 'similar', value: 'hi', threshold: 0.5 },
        { type: 'llm-rubric', value: 'Rate {output}' },
      ]);
    });

    it('falls back to input vars and skips dangling refs', () => {
      const suite: EvalPortSuite = {
        version: '1.0.0',
        id: 'foreign',
        test_cases: [
          {
            id: 'tc_1',
            input: ['a', 'b'],
            graders: ['missing', { id: 'inline', type: 'contains', params: { substring: 'x' } }],
          },
        ],
        graders: [],
      };
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.vars).toEqual({ input: '["a","b"]' });
      expect(restored[0]?.assert).toEqual([{ type: 'contains', value: 'x' }]);
      expect(restored[0]?.provider).toBeUndefined();
      expect(restored[0]?.description).toBeUndefined();
      expect(restored[0]?.threshold).toBeUndefined();
    });

    it('restores per-test provider overrides', () => {
      const tests: TestCase[] = [
        {
          vars: { q: 'a' },
          provider: 'openai:gpt-4o',
          assert: [{ type: 'equals', value: 'x' }],
        },
        {
          vars: { q: 'b' },
          provider: { id: 'openai:gpt-4o-mini' } as never,
          assert: [{ type: 'equals', value: 'y' }],
        },
        { vars: { q: 'c' }, assert: [{ type: 'equals', value: 'z' }] },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.provider).toBe('openai:gpt-4o');
      expect(restored[1]?.provider).toBe('openai:gpt-4o-mini');
      expect(restored[2]?.provider).toBeUndefined();
    });

    it('preserves test metadata alongside unmapped graders', () => {
      const suite = foreignSuite([{ id: 'g1', type: 'weird' }]);
      suite.test_cases[0] = {
        ...suite.test_cases[0],
        metadata: { promptfoo: { testMetadata: { team: 'evals' } } },
      };
      const restored = evalPortSuiteToPromptfooTests(suite);
      expect(restored[0]?.assert).toBeUndefined();
      expect(restored[0]?.metadata).toMatchObject({
        team: 'evals',
        evalportGraders: [{ id: 'g1', type: 'weird' }],
      });
    });

    it('expands nested assert-sets and records attribution', () => {
      const tests: TestCase[] = [
        {
          vars: { q: 'a' },
          assert: [
            {
              type: 'assert-set',
              metric: 'outer',
              threshold: 0.5,
              assert: [
                {
                  type: 'assert-set',
                  assert: [{ type: 'equals', value: 'x' }],
                } as never,
              ],
            },
          ],
        },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      expect(suite.graders).toHaveLength(1);
      expect(suite.graders[0]?.metadata).toMatchObject({
        promptfoo: { assertSet: { metric: 'outer', threshold: 0.5 } },
      });
    });

    it('omits expected output without reference assertions and reads vars context', () => {
      const suite = promptfooTestsToEvalPortSuite(
        [
          {
            vars: { q: 'a', context: ['France is in Europe.'] },
            assert: [{ type: 'javascript', value: 'output.length > 0' }],
          },
          {
            vars: { q: 'b', context: 42 } as never,
            assert: [{ type: 'javascript', value: 'output.length > 0' }],
          },
        ],
        { suiteId: 's' },
      );
      expect(suite.test_cases[0]?.expected_output).toBeUndefined();
      expect(suite.test_cases[0]?.context).toEqual(['France is in Europe.']);
      expect(suite.test_cases[1]?.context).toBeUndefined();
    });
  });

  describe('result export edge cases', () => {
    it('marks null scores unverified and types assertion-less results custom', () => {
      const results = [
        makeResult({
          testIdx: 0,
          gradingResult: {
            pass: false,
            score: Number.NaN,
            reason: 'no score recorded',
            assertion: { type: 'equals', value: 'x' },
          },
          success: false,
          score: 0,
        }),
        makeResult({ testIdx: 1 }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
      });
      const [scoreless, plain] = resultSet.results;
      expect(scoreless?.grader_results[0]).toMatchObject({
        type: 'exact_match',
        score: null,
        passed: false,
        metadata: { promptfoo: { unverified: true } },
      });
      expect(plain?.grader_results[0]).toMatchObject({ type: 'custom', score: 1 });
      expect(plain?.grader_results[0]?.metadata).toEqual({
        promptfoo: {},
      });
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('omits missing outputs and durations and maps runner errors', () => {
      const results = [
        makeResult({
          testIdx: 0,
          response: undefined,
          latencyMs: Number.NaN,
          error: '',
          failureReason: ResultFailureReason.ASSERT,
          success: false,
          score: 0,
          gradingResult: undefined,
        }),
        makeResult({
          testIdx: 1,
          response: { output: { text: 'hi' } },
          error: 'runner crashed',
          failureReason: ResultFailureReason.ASSERT,
          success: false,
          score: 0,
          gradingResult: undefined,
        }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
      });
      expect(resultSet.results[0]?.actual_output).toBeUndefined();
      expect(resultSet.results[0]?.duration_ms).toBeUndefined();
      expect(resultSet.results[0]?.error).toBeUndefined();
      expect(resultSet.results[1]?.actual_output).toBe('{"text":"hi"}');
      expect(resultSet.results[1]?.error).toMatchObject({
        message: 'runner crashed',
        type: 'runner_error',
      });
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });

    it('records cost, labels, named scores, and honors export options', () => {
      const results = [
        makeResult({
          provider: { id: 'openai:gpt-4o-mini', label: 'mini' },
          cost: 0.5,
          namedScores: { exact: 1 },
        }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, {
        suiteId: 's',
        runId: 'run-1',
        providerModel: 'custom-model',
        runnerVersion: '9.9',
        completedAt: '2026-01-02T00:00:00.000Z',
        group: { group_id: 'g' },
      });
      expect(resultSet.provider).toMatchObject({ model: 'custom-model' });
      expect(resultSet.runner).toMatchObject({ name: 'promptfoo', version: '9.9' });
      expect(resultSet.completed_at).toBe('2026-01-02T00:00:00.000Z');
      expect(resultSet.group).toMatchObject({ group_id: 'g' });
      expect(resultSet.results[0]?.metadata).toMatchObject({
        promptfoo: {
          providerLabel: 'mini',
          namedScores: { exact: 1 },
          cost: 0.5,
        },
      });
    });

    it('derives a default run id and omits provider for mixed models', () => {
      const results = [
        makeResult({ testIdx: 0, provider: { id: 'openai:gpt-4o' } }),
        makeResult({ testIdx: 1, provider: { id: 'openai:gpt-4o-mini' } }),
      ];
      const resultSet = evaluateResultsToEvalPortResultSet(results, { suiteId: 's' });
      expect(resultSet.run_id.startsWith('run_')).toBe(true);
      expect(resultSet.provider).toBeUndefined();
    });

    it('summarizes empty result lists without NaN', () => {
      const resultSet = evaluateResultsToEvalPortResultSet([], { suiteId: 's', runId: 'r' });
      expect(resultSet.summary).toMatchObject({
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pass_rate: 0,
        avg_score: 0,
        duration_ms: 0,
      });
    });

    it('falls back to positional ids for negative test indexes', () => {
      const resultSet = evaluateResultsToEvalPortResultSet([makeResult({ testIdx: -1 })], {
        suiteId: 's',
        runId: 'run-1',
      });
      expect(resultSet.results[0]?.test_case_id).toBe('tc_1');
      expect(validateEvalPortResultSet(resultSet).valid).toBe(true);
    });
  });

  describe('result import edge cases', () => {
    it('restores suite vars, errors, and provider precedence', () => {
      const tests: TestCase[] = [
        { vars: { question: 'Capital of France?' }, assert: [{ type: 'equals', value: 'x' }] },
      ];
      const suite = promptfooTestsToEvalPortSuite(tests, { suiteId: 's' });
      const exported = evaluateResultsToEvalPortResultSet(
        [
          makeResult({
            testIdx: 0,
            error: 'provider timed out',
            failureReason: ResultFailureReason.ERROR,
          }),
        ],
        { suiteId: 's', runId: 'run-1', suite },
      );
      const [row] = evalPortResultSetToEvaluateResults(exported, { suite });
      expect(row?.vars).toEqual({ question: 'Capital of France?' });
      expect(row?.failureReason).toBe(ResultFailureReason.ERROR);
      expect(row?.error).toBe('provider timed out');

      const [overridden] = evalPortResultSetToEvaluateResults(exported, {
        providerId: 'override',
      });
      expect(overridden?.provider).toEqual({ id: 'override' });
    });

    it('imports foreign result sets with documented fallbacks', () => {
      const resultSet: EvalPortResultSet = {
        version: '1.0.0',
        suite_id: 's',
        run_id: 'r',
        started_at: '2026-01-01T00:00:00.000Z',
        provider: { model: 'set-level' },
        results: [
          { test_case_id: 'tc_9', grader_results: [], passed: false },
          {
            test_case_id: 'tc_10',
            grader_results: [{ grader_id: 'g', type: 'x', score: null, passed: false }],
            passed: true,
          },
        ],
      };
      const [failed, passed] = evalPortResultSetToEvaluateResults(resultSet);
      expect(failed?.provider).toEqual({ id: 'set-level' });
      expect(failed?.score).toBe(0);
      expect(failed?.failureReason).toBe(ResultFailureReason.ASSERT);
      expect(failed?.response).toBeUndefined();
      expect(failed?.latencyMs).toBe(0);
      expect(failed?.gradingResult?.componentResults).toEqual([]);
      expect(failed?.namedScores).toEqual({});
      expect(failed?.metadata).toMatchObject({
        evalport: { suiteId: 's', runId: 'r', testCaseId: 'tc_9' },
      });
      expect(passed?.score).toBe(1);
      expect(passed?.failureReason).toBe(ResultFailureReason.NONE);
      expect(passed?.gradingResult?.componentResults).toEqual([
        {
          pass: false,
          score: 0,
          reason: '',
          metadata: { evalport: { graderId: 'g', type: 'x' } },
        },
      ]);
    });

    it('defaults foreign providers to evalport', () => {
      const resultSet: EvalPortResultSet = {
        version: '1.0.0',
        suite_id: 's',
        run_id: 'r',
        started_at: '2026-01-01T00:00:00.000Z',
        results: [{ test_case_id: 'tc_1', grader_results: [], passed: true }],
      };
      const [row] = evalPortResultSetToEvaluateResults(resultSet);
      expect(row?.provider).toEqual({ id: 'evalport' });
      expect(row?.testIdx).toBe(0);
    });
  });

  describe('validator edge cases', () => {
    it('rejects malformed suites', () => {
      expect(validateEvalPortSuite(null).valid).toBe(false);
      expect(validateEvalPortSuite({}).errors).toEqual(
        expect.arrayContaining([
          'Suite must have a non-empty string version.',
          'Suite must have a non-empty string id.',
          'Suite must have a non-empty test_cases array.',
        ]),
      );
      expect(validateEvalPortSuite({ version: '1', id: 's', test_cases: 'x' }).valid).toBe(false);

      const base = promptfooTestsToEvalPortSuite(
        [{ vars: { q: 'a' }, assert: [{ type: 'equals', value: 'x' }] }],
        { suiteId: 's' },
      );
      const duplicateGrader = {
        ...base,
        graders: [...base.graders, { ...base.graders[0] }],
      };
      expect(
        validateEvalPortSuite(duplicateGrader).errors.some((error) =>
          error.includes('Duplicate suite grader id'),
        ),
      ).toBe(true);

      const badGraders: EvalPortSuite = {
        ...base,
        graders: [
          null as never,
          {} as never,
          { id: 'g-missing-type' } as never,
          { id: 'g-weird', type: 'weird' } as never,
          { id: 'g-contains', type: 'contains', params: { substring: '' } } as never,
          { id: 'g-regex', type: 'regex', params: { pattern: '' } } as never,
          { id: 'g-sem', type: 'semantic_similarity', params: { threshold: 2 } } as never,
          { id: 'g-judge', type: 'llm_judge', params: {} } as never,
          {
            id: 'g-judge-text',
            type: 'llm_judge',
            params: { model: 'm', prompt: 'no placeholders' },
          } as never,
          { id: 'g-code', type: 'code', params: { language: 'python' } } as never,
          { type: 'contains', params: { substring: 'x' } } as never,
        ],
      };
      const graderErrors = validateEvalPortSuite({
        ...badGraders,
        test_cases: [{ id: 'tc_1', input: 'x', graders: [] }],
      }).errors;
      expect(graderErrors.length).toBeGreaterThan(8);

      const validExtras: EvalPortSuite = {
        ...base,
        graders: [
          ...base.graders,
          { id: 'g-code', type: 'code', params: { language: 'python', source: 'x' } },
          { id: 'g-path', type: 'json_path' },
          {
            id: 'g-graded',
            type: 'model graded',
            params: { model: 'm', prompt: 'Rate {output}' },
          },
        ],
      };
      expect(validateEvalPortSuite(validExtras).valid).toBe(true);

      const badCases = {
        ...base,
        test_cases: [
          null,
          { id: '', input: 'x', graders: [] },
          { id: 'dup', input: 42, graders: [] },
          { id: 'dup', input: 'x', graders: 'nope' },
          { id: 'tc_9', input: 'x', graders: [{ id: '', type: '' }] },
        ],
      };
      const caseErrors = validateEvalPortSuite(badCases).errors;
      expect(caseErrors.some((error) => error.includes('must be an object'))).toBe(true);
      expect(caseErrors.some((error) => error.includes('non-empty string id'))).toBe(true);
      expect(caseErrors.some((error) => error.includes('Duplicate test case id'))).toBe(true);
      expect(caseErrors.some((error) => error.includes('string or array input'))).toBe(true);
      expect(caseErrors.some((error) => error.includes('must have a graders array'))).toBe(true);
      expect(caseErrors.some((error) => error.includes('inline grader'))).toBe(true);

      const noGraderKey = {
        version: '1.0.0',
        id: 's',
        test_cases: [{ id: 'tc_1', input: 'x', graders: [] }],
      };
      expect(validateEvalPortSuite(noGraderKey).valid).toBe(true);
    });

    it('rejects malformed result sets', () => {
      expect(validateEvalPortResultSet(null).valid).toBe(false);
      expect(validateEvalPortResultSet({}).errors).toEqual(
        expect.arrayContaining([
          'ResultSet must have a non-empty string version.',
          'ResultSet must have a non-empty string suite_id.',
          'ResultSet must have a non-empty string run_id.',
          'ResultSet must have a non-empty string started_at.',
        ]),
      );
      expect(
        validateEvalPortResultSet({
          version: '1',
          suite_id: 's',
          run_id: 'r',
          started_at: 't',
          results: [],
        }).valid,
      ).toBe(false);

      const base = evaluateResultsToEvalPortResultSet([makeResult({ testIdx: 0 })], {
        suiteId: 's',
        runId: 'run-1',
      });
      const badEntries: EvalPortResultSet = {
        ...base,
        results: [
          null as never,
          { test_case_id: '', grader_results: [], passed: true } as never,
          { test_case_id: 'tc_x', grader_results: [], passed: 'yes' } as never,
          { test_case_id: 'tc_y', grader_results: [], passed: true } as never,
          {
            test_case_id: 'tc_z',
            grader_results: [
              null as never,
              { grader_id: '', type: 'x', score: 1, passed: true } as never,
              { grader_id: 'g', type: '', score: 1, passed: true } as never,
              { grader_id: 'g', type: 'x', score: 2, passed: true } as never,
              { grader_id: 'g', type: 'x', score: 1, passed: 'yes' } as never,
            ],
            passed: true,
          } as never,
        ],
      };
      const entryErrors = validateEvalPortResultSet(badEntries).errors;
      expect(entryErrors.some((error) => error.includes('must be an object'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('non-empty string test_case_id'))).toBe(
        true,
      );
      expect(entryErrors.some((error) => error.includes('boolean passed'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('non-empty grader_results'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('missing grader_id'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('missing type'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('outside [0, 1]'))).toBe(true);
      expect(entryErrors.some((error) => error.includes('non-boolean passed'))).toBe(true);

      const duplicate: EvalPortResultSet = {
        ...base,
        results: [base.results[0]!, base.results[0]!],
      };
      expect(
        validateEvalPortResultSet(duplicate).errors.some((error) =>
          error.includes('Duplicate result key'),
        ),
      ).toBe(true);

      const distinctAttempts: EvalPortResultSet = {
        ...base,
        results: [
          { ...base.results[0]!, attempt: 1 },
          { ...base.results[0]!, attempt: 2 },
        ],
      };
      expect(validateEvalPortResultSet(distinctAttempts).valid).toBe(true);

      const duplicateAttempts: EvalPortResultSet = {
        ...base,
        results: [
          { ...base.results[0]!, attempt: 1 },
          { ...base.results[0]!, attempt: 1 },
        ],
      };
      expect(
        validateEvalPortResultSet(duplicateAttempts).errors.some((error) =>
          error.includes('Duplicate result key "tc_1#1"'),
        ),
      ).toBe(true);
    });
  });
});
