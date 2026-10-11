import './setup';

import { randomUUID } from 'crypto';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { ResultFailureReason } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

function gradingProviderWith(response: Record<string, unknown>): ApiProvider {
  return {
    id: () => 'closedqa-grading-provider',
    callApi: vi.fn().mockResolvedValue(response),
  };
}

async function runClosedQaEval(gradingResponse: Record<string, unknown>) {
  const testSuite: TestSuite = {
    providers: [mockApiProvider],
    prompts: [toPrompt('Test prompt')],
    tests: [
      {
        assert: [{ type: 'model-graded-closedqa', value: 'The reference answer' }],
        options: { provider: gradingProviderWith(gradingResponse) },
      },
    ],
  };
  const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

  await evaluate(testSuite, evalRecord, {});
  return evalRecord.toEvaluateSummary();
}

describeEvaluator('evaluator grader-failure classification', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([0, 1])('classifies a redteam grader error with weight %s', async (weight) => {
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
      grade: {
        pass: false,
        score: 0,
        reason: 'Redteam grader unavailable',
        metadata: { graderError: true },
      },
      rubric: 'Safety criterion',
    });
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            { type: 'promptfoo:redteam:pii', weight, metric: 'PII' },
            { type: 'equals', value: 'Unmatched answer' },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {});
    const {
      results: [result],
    } = await record.toEvaluateSummary();
    expect(result.success).toBe(false);
    expect(result.score).toBe(0);
    expect(result.failureReason).toBe(
      weight === 0 ? ResultFailureReason.ASSERT : ResultFailureReason.ERROR,
    );
    expect(result.gradingResult?.metadata?.graderError).toBe(weight === 0 ? undefined : true);
    expect(result.gradingResult?.componentResults?.[0]).toMatchObject({
      pass: false,
      assertion: { weight },
      metadata: { graderError: true },
    });
    expect(result.namedScores).toEqual({ PII: 0 });
  });

  it('does not carry a forgiven grader error into a later comparison failure', async () => {
    const suite: TestSuite = {
      providers: ['loser', 'winner'].map((output) => ({
        id: () => output,
        callApi: async () => ({ output }),
      })),
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: (output) => ({
                pass: output === 'winner',
                score: output === 'winner' ? 1 : 0,
                reason: 'Custom grade',
                ...(output !== 'winner' && { metadata: { graderError: true } }),
              }),
            },
            { type: 'max-score' },
          ],
          assertScoringFunction: (_, context) => ({
            pass: true,
            score: context!.componentResults![0].score,
            reason: 'Custom scoring accepts both',
          }),
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {});
    const { results } = await record.toEvaluateSummary();
    const loser = results.find((result) => result.provider.id === 'loser')!;
    expect(loser.failureReason).toBe(ResultFailureReason.ASSERT);
    expect(loser.gradingResult?.metadata?.graderError).toBeUndefined();
    expect(loser.gradingResult?.componentResults?.[0].metadata?.graderError).toBe(true);
    expect(results.find((result) => result.provider.id === 'winner')?.success).toBe(true);
  });

  it('retains passed components when a comparison grader fails', async () => {
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('first'), toPrompt('second')],
      tests: [
        {
          assert: [
            { type: 'javascript', value: () => true },
            {
              type: 'select-best',
              value: 'Choose the best',
              provider: {
                id: () => 'comparison-grader',
                callApi: async () => {
                  throw new Error('Comparison unavailable');
                },
              },
            },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, {});
    const { results } = await record.toEvaluateSummary();
    for (const result of results) {
      expect(result.failureReason).toBe(ResultFailureReason.ERROR);
      expect(result.error).toContain('Error grading select-best');
      expect(result.gradingResult?.componentResults).toHaveLength(1);
      expect(result.gradingResult?.componentResults?.[0].pass).toBe(true);
    }
  });

  it('marks a closed-QA grader execution failure as ERROR, not an assertion failure', async () => {
    const summary = await runClosedQaEval({ error: 'Grader provider unavailable' });

    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].failureReason).toBe(ResultFailureReason.ERROR);
    expect(summary.results[0].error).toContain('Grader provider unavailable');
    expect(summary.results[0].gradingResult?.metadata?.graderError).toBe(true);
  });

  it('keeps a valid closed-QA negative grade as an ordinary assertion failure', async () => {
    const summary = await runClosedQaEval({
      output: 'The submission does not meet the criterion. N',
    });

    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].failureReason).toBe(ResultFailureReason.ASSERT);
    expect(summary.results[0].gradingResult?.metadata?.graderError).toBeUndefined();
  });
});
