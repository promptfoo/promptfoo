import './setup';

import { randomUUID } from 'crypto';

import { expect, it } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

describeEvaluator('max-score with rubric batches', () => {
  it('selects the higher configured weighted score after persisted grading', async () => {
    let calls = 0;
    const grader: ApiProvider = {
      id: () => 'offline-max-score-grader',
      callApi: async (_prompt, context) => {
        calls++;
        const weighted = context?.vars.outputText === 'weighted';
        return {
          output: JSON.stringify({
            components: [
              { metric: 'accuracy', pass: true, score: weighted ? 1 : 0.7, reason: 'Accuracy' },
              { metric: 'style', pass: !weighted, score: weighted ? 0 : 0.7, reason: 'Style' },
            ],
          }),
          tokenUsage: { prompt: 10, completion: 5, numRequests: 1 },
        };
      },
    };
    const testSuite: TestSuite = {
      providers: ['weighted', 'uniform'].map((output) => ({
        id: () => `offline-${output}`,
        callApi: async () => ({ output }),
      })),
      prompts: [toPrompt('Candidate')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              rubricComponents: true,
              provider: grader,
              threshold: 0.5,
              value: {
                components: [
                  { metric: 'accuracy', value: 'Correct', weight: 9 },
                  { metric: 'style', value: 'Clear', weight: 1 },
                ],
              },
            },
            { type: 'max-score' },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    const { results } = await evalRecord.toEvaluateSummary();
    const weighted = results.find((result) => result.response?.output === 'weighted')!;
    const uniform = results.find((result) => result.response?.output === 'uniform')!;
    expect(weighted.success).toBe(true);
    expect(uniform.success).toBe(false);
    expect(weighted.gradingResult?.namedScores?.maxScore).toBe(0.9);
    expect(uniform.gradingResult?.namedScores?.maxScore).toBe(0.7);
    expect(weighted.gradingResult?.componentResults).toHaveLength(4);
    expect(weighted.gradingResult?.componentResults?.[0]).toMatchObject({
      score: 0.9,
      componentResults: [{ score: 1 }, { score: 0 }],
      metadata: { renderedGradingPrompt: expect.any(String) },
    });
    expect(weighted.gradingResult?.tokensUsed?.numRequests).toBe(1);
    expect(calls).toBe(2);
  });
});
