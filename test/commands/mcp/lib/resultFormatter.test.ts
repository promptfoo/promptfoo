import { describe, expect, it } from 'vitest';
import { formatEvaluationResults } from '../../../../src/commands/mcp/lib/resultFormatter';
import { ResultFailureReason } from '../../../../src/types/index';

import type { EvaluateSummaryV3 } from '../../../../src/types/index';

describe('formatEvaluationResults', () => {
  it('excludes metricOnly assertions from assertion pass/fail counts', () => {
    const summary = {
      results: [
        {
          promptIdx: 0,
          testIdx: 0,
          testCase: {
            assert: [
              { type: 'contains', value: 'test' },
              { type: 'javascript', value: '0', metric: 'fp', metricOnly: true },
            ],
          },
          prompt: { raw: 'test prompt', label: 'test' },
          promptId: 'prompt-test',
          provider: { id: 'test-provider' },
          vars: {},
          response: { output: 'test output' },
          success: true,
          score: 1,
          latencyMs: 10,
          namedScores: { fp: 0 },
          failureReason: ResultFailureReason.NONE,
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'All assertions passed',
            componentResults: [
              {
                pass: true,
                score: 1,
                reason: 'ok',
                assertion: { type: 'contains', value: 'test' },
              },
              {
                pass: false,
                score: 0,
                reason: 'counter',
                assertion: { type: 'javascript', metric: 'fp', metricOnly: true },
              },
            ],
          },
        },
      ],
    } as unknown as EvaluateSummaryV3;

    const { results } = formatEvaluationResults(summary);

    expect(results).toHaveLength(1);
    // The failing metricOnly counter must not surface as a failed assertion,
    // and the total must reconcile with passed + failed (not include the
    // metricOnly assertion via testCase.assert length).
    expect(results[0].assertions).toMatchObject({
      totalAssertions: 1,
      passedAssertions: 1,
      failedAssertions: 0,
    });
  });
});
