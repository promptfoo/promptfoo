import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
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
