import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import EvalResult, { getStripFlags } from '../../src/models/evalResult';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describeEvaluator('repeat cache evidence after imported comparison grading', () => {
  it.each([
    { targetCached: false, comparisonCached: false, expectedCached: 0 },
    { targetCached: false, comparisonCached: true, expectedCached: 4 },
    { targetCached: true, comparisonCached: false, expectedCached: 4 },
  ])(
    'updates retained evidence after resume: %j',
    async ({ targetCached, comparisonCached, expectedCached }) => {
      vi.mocked(mockApiProvider.callApi).mockResolvedValue({
        output: 'Target output',
        cached: targetCached,
      });
      const rubricProvider: ApiProvider = {
        id: () => 'local-rubric',
        callApi: vi.fn().mockResolvedValue({
          output: JSON.stringify({ pass: true, score: 1, reason: 'Cached rubric' }),
          cached: true,
        }),
      };
      const comparisonProvider: ApiProvider = {
        id: () => 'local-comparison',
        callApi: vi.fn().mockResolvedValue({ output: '0', cached: true }),
      };
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
        tests: [
          {
            assert: [
              { type: 'llm-rubric', value: 'A useful answer', provider: rubricProvider },
              {
                type: 'select-best',
                value: 'Choose the best answer',
                provider: comparisonProvider,
              },
            ],
          },
        ],
      };
      const original = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, original, { repeat: 2, maxConcurrency: 1 });
      await original.loadResults();
      const flags = getStripFlags({ PROMPTFOO_STRIP_GRADING_RESULT: 'true' });
      const exported = original.results.map((result) => result.toEvaluateResult(flags));
      expect(exported).toHaveLength(4);
      expect(exported.every((result) => result.repeatCached && result.gradingResult === null)).toBe(
        true,
      );

      const imported = await Eval.create({}, testSuite.prompts, {
        id: randomUUID(),
        completedPrompts: original.prompts,
      });
      await EvalResult.createManyFromEvaluateResult(exported, imported.id);
      const resumed = (await Eval.findById(imported.id))!;
      expect((await resumed.getRepeatStability())?.cachedResults).toBe(4);

      vi.mocked(mockApiProvider.callApi).mockClear();
      vi.mocked(rubricProvider.callApi).mockClear();
      vi.mocked(comparisonProvider.callApi).mockClear().mockResolvedValue({
        output: '0',
        cached: comparisonCached,
      });
      cliState.resume = true;
      await evaluate(testSuite, resumed, { repeat: 2, maxConcurrency: 1 });
      expect(mockApiProvider.callApi).not.toHaveBeenCalled();
      expect(rubricProvider.callApi).not.toHaveBeenCalled();
      expect(comparisonProvider.callApi).toHaveBeenCalledTimes(2);

      const reloaded = (await Eval.findById(imported.id))!;
      const summary = await reloaded.toEvaluateSummary();
      expect(summary.results).toHaveLength(4);
      for (const result of summary.results) {
        expect(result.response?.cached).toBe(targetCached);
        expect(result.repeatCached).toBe(comparisonCached ? true : undefined);
        expect(result.gradingResult?.metadata?.cachedResponse).toBe(
          comparisonCached ? true : undefined,
        );
      }
      const stability = await reloaded.getRepeatStability();
      expect(stability?.cachedResults).toBe(expectedCached);
      expect(
        stability?.groups.every(
          (group) => Boolean(group.passRateConfidenceInterval) === !expectedCached,
        ),
      ).toBe(true);
    },
  );
});
