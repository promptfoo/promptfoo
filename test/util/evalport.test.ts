import { describe, expect, it } from 'vitest';
import { ResultFailureReason } from '../../src/types/index';
import {
  evalPortResultSetToEvaluateResults,
  evalPortSuiteToPromptfooTests,
  evaluateResultsToEvalPortResultSet,
  evaluateSummaryToEvalPortResultSet,
  promptfooTestsToEvalPortSuite,
  validateEvalPortResultSet,
  validateEvalPortSuite,
} from '../../src/util/evalport';

import type { EvaluateResult, EvaluateSummaryV3, TestCase } from '../../src/types/index';

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
});
