import './setup';

import { randomUUID } from 'crypto';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import * as evaluatorHelpers from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { TestSuite } from '../../src/types/index';

describeEvaluator('optional derived metric dependency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([undefined, []])(
    'runs ordinary evaluations without loading Math.js (%j)',
    async (derivedMetrics) => {
      const loader = vi
        .spyOn(evaluatorHelpers, 'loadMathJs')
        .mockRejectedValue(new Error('unavailable'));
      const suite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Ordinary evaluation')],
        tests: [{ assert: [{ type: 'contains', value: 'Test' }] }],
        derivedMetrics,
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

      await evaluate(suite, record, {});

      expect((await record.toEvaluateSummary()).results[0].success).toBe(true);
      expect(loader).not.toHaveBeenCalled();
    },
  );

  it('calculates JavaScript function metrics without loading Math.js', async () => {
    const loader = vi
      .spyOn(evaluatorHelpers, 'loadMathJs')
      .mockRejectedValue(new Error('unavailable'));
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Function metrics')],
      tests: [{ assert: [{ type: 'javascript', value: '2', metric: 'Score' }] }],
      derivedMetrics: [{ name: 'Average', value: (scores) => scores.Score / scores.__count }],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, {});

    expect(record.prompts[0].metrics?.namedScores).toMatchObject({ Score: 2, Average: 2 });
    expect(loader).not.toHaveBeenCalled();
  });

  it('reports a missing expression dependency before calling a provider', async () => {
    const error = new Error(
      'String derived metrics require mathjs; install it alongside Promptfoo',
    );
    vi.spyOn(evaluatorHelpers, 'loadMathJs').mockRejectedValue(error);
    const suite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Expression metrics')],
      tests: [{}],
      derivedMetrics: [
        { name: 'FunctionMetric', value: () => 1 },
        { name: 'ExpressionMetric', value: 'FunctionMetric + 1' },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await expect(evaluate(suite, record, {})).rejects.toBe(error);
    expect(mockApiProvider.callApi).not.toHaveBeenCalled();
  });
});
