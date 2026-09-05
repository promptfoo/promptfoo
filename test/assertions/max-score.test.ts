import { describe, expect, it } from 'vitest';
import { runAssertions } from '../../src/assertions/index';
import { selectMaxScore } from '../../src/matchers/comparison';

import type { ApiProvider, Assertion } from '../../src/types/index';

describe('max-score assertion integration', () => {
  it.each([false, true])(
    'ranks the weighted batch score once after real assertion grading (nested=%s)',
    async (nested) => {
      let calls = 0;
      const grader: ApiProvider = {
        id: () => 'offline-weighted-grader',
        callApi: async (_prompt, context) => {
          calls++;
          const scores = context?.vars.outputText === 'weighted' ? [1, 0] : [0.7, 0.7];
          return {
            output: JSON.stringify({
              components: ['accuracy', 'style'].map((metric, index) => ({
                metric,
                pass: scores[index] > 0,
                score: scores[index],
                reason: metric,
              })),
            }),
          };
        },
      };
      const batch: Assertion = {
        type: 'llm-rubric',
        rubricComponents: true,
        provider: grader,
        value: {
          components: [
            { metric: 'accuracy', value: 'Correct', weight: 9 },
            { metric: 'style', value: 'Clear', weight: 1 },
          ],
        },
      };
      const outputs = ['weighted', 'uniform'];
      const graded = await Promise.all(
        outputs.map(async (output) => ({
          gradingResult: await runAssertions({
            providerResponse: { output },
            test: { assert: [nested ? { type: 'assert-set', assert: [batch] } : batch] },
          }),
        })),
      );
      const originalResults = JSON.stringify(graded);
      expect(graded.map(({ gradingResult }) => gradingResult.score)).toEqual([0.9, 0.7]);

      // Round-trip persisted results: the comparison must not depend on object identity.
      const selected = await selectMaxScore(outputs, JSON.parse(originalResults), {
        type: 'max-score',
      });
      expect(selected.map((result) => result.pass)).toEqual([true, false]);
      expect(selected.map((result) => result.namedScores?.maxScore)).toEqual([0.9, 0.7]);
      expect(selected.map((result) => result.namedScores?.assertionCount)).toEqual([1, 1]);
      expect(JSON.stringify(graded)).toBe(originalResults);
      expect(calls).toBe(2);

      const inverted = await Promise.all(
        outputs.map(async (output) => ({
          gradingResult: await runAssertions({
            providerResponse: { output },
            test: { assert: [{ ...batch, type: 'not-llm-rubric' }] },
          }),
        })),
      );
      const inverseSelected = await selectMaxScore(outputs, inverted, { type: 'max-score' });
      expect(inverseSelected.map((result) => result.pass)).toEqual([false, true]);
      expect(inverseSelected[0].namedScores?.maxScore).toBeCloseTo(0.1);
      expect(inverseSelected[1].namedScores?.maxScore).toBeCloseTo(0.3);

      const withSibling = await Promise.all(
        outputs.map(async (output) => ({
          gradingResult: await runAssertions({
            providerResponse: { output },
            test: { assert: [batch, { type: 'contains', value: output }] },
          }),
        })),
      );
      const summed = await selectMaxScore(outputs, withSibling, {
        type: 'max-score',
        value: { method: 'sum', weights: { 'llm-rubric': 2 } },
      });
      expect(summed.map((result) => result.pass)).toEqual([true, false]);
      expect(summed.map((result) => result.namedScores?.maxScore)).toEqual([2.8, 2.4]);
      expect(summed.map((result) => result.namedScores?.assertionCount)).toEqual([2, 2]);
    },
  );

  it('preserves scalar assert-set scoring and childless batch failures', async () => {
    const outputs = ['apple orange', 'apple'];
    const legacy = await Promise.all(
      outputs.map(async (output) => ({
        gradingResult: await runAssertions({
          providerResponse: { output },
          test: {
            assert: [
              {
                type: 'assert-set',
                assert: [
                  { type: 'contains', value: 'apple' },
                  { type: 'contains', value: 'orange' },
                ],
              },
            ],
          },
        }),
      })),
    );
    const selected = await selectMaxScore(outputs, legacy, { type: 'max-score' });
    expect(selected.map((result) => result.namedScores?.maxScore)).toEqual([1, 0.5]);
    expect(selected.map((result) => result.namedScores?.assertionCount)).toEqual([2, 2]);

    const grader: ApiProvider = {
      id: () => 'invalid-batch-grader',
      callApi: async () => ({ output: '{"components":[]}' }),
    };
    const failed = await runAssertions({
      providerResponse: { output: 'candidate' },
      test: {
        assert: [
          {
            type: 'llm-rubric',
            rubricComponents: true,
            provider: grader,
            value: { components: [{ metric: 'quality', value: 'Good' }] },
          },
        ],
      },
    });
    const comparison = await selectMaxScore(outputs, [{ gradingResult: failed }, legacy[0]], {
      type: 'max-score',
    });
    expect(comparison[0]).toMatchObject({
      pass: false,
      namedScores: { maxScore: 0, assertionCount: 1 },
    });
    expect(comparison[1].pass).toBe(true);
  });

  it('should exclude max-score from regular assertion processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'max-score' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only the contains assertion should be processed
    expect(result.componentResults).toHaveLength(1);
    expect(result.componentResults![0].assertion?.type).toBe('contains');
  });

  it('should filter out select-best and max-score from processing', async () => {
    const test = {
      assert: [
        { type: 'contains', value: 'test' } as Assertion,
        { type: 'select-best', value: 'best criteria' } as Assertion,
        { type: 'max-score' } as Assertion,
        { type: 'equals', value: 'test output' } as Assertion,
      ],
    };

    const result = await runAssertions({
      prompt: 'test prompt',
      providerResponse: { output: 'test output' },
      test,
    });

    // Only contains and equals should be processed
    expect(result.componentResults).toHaveLength(2);
    const processedTypes = result.componentResults!.map((cr) => cr.assertion?.type);
    expect(processedTypes).toEqual(['contains', 'equals']);
  });
});
