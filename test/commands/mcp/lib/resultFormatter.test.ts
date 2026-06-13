import { describe, expect, it } from 'vitest';
import { formatEvaluationResults } from '../../../../src/commands/mcp/lib/resultFormatter';
import { ResultFailureReason } from '../../../../src/types/index';

import type { EvaluateResult, EvaluateSummaryV3 } from '../../../../src/types/index';

function makeResult(overrides: Partial<EvaluateResult>): EvaluateResult {
  return {
    id: 'r1',
    evalId: 'e1',
    promptIdx: 0,
    testIdx: 0,
    testCase: { assert: [] },
    promptId: 'p1',
    provider: { id: 'test-provider', label: 'test' },
    prompt: { raw: 'hi', label: 'hi' },
    vars: {},
    response: { output: 'ok' },
    error: null,
    failureReason: ResultFailureReason.NONE,
    success: true,
    score: 1,
    latencyMs: 10,
    namedScores: {},
    metadata: {},
    ...overrides,
  } as EvaluateResult;
}

describe('resultFormatter assertion counts', () => {
  it('excludes metric-only component results from passed/failed assertion counts', () => {
    const summary: EvaluateSummaryV3 = {
      version: 3,
      stats: { successes: 1, failures: 0, errors: 0, tokenUsage: {} },
      results: [
        makeResult({
          testCase: {
            assert: [
              { type: 'cost', metric: 'total_cost' },
              { type: 'contains', value: 'ok' },
            ],
          },
          gradingResult: {
            pass: true,
            score: 1,
            reason: 'ok',
            componentResults: [
              {
                pass: true,
                score: 0.05,
                reason: 'metric',
                assertion: { type: 'cost', metric: 'total_cost' },
                metadata: { isMetricOnly: true },
              },
              {
                pass: true,
                score: 1,
                reason: 'contains',
                assertion: { type: 'contains', value: 'ok' },
              },
            ],
          },
        }),
      ],
      prompts: [{ label: 'hi', provider: 'test-provider', metrics: {} }],
    } as unknown as EvaluateSummaryV3;

    const { results } = formatEvaluationResults(summary);
    expect(results[0].assertions).not.toBeNull();
    expect(results[0].assertions?.passedAssertions).toBe(1);
    expect(results[0].assertions?.failedAssertions).toBe(0);
  });

  it('counts a failing real assertion alongside a passing metric-only result', () => {
    const summary: EvaluateSummaryV3 = {
      version: 3,
      stats: { successes: 0, failures: 1, errors: 0, tokenUsage: {} },
      results: [
        makeResult({
          success: false,
          failureReason: ResultFailureReason.ASSERT,
          score: 0,
          testCase: {
            assert: [
              { type: 'latency', metric: 'total_latency_ms' },
              { type: 'contains', value: 'missing' },
            ],
          },
          gradingResult: {
            pass: false,
            score: 0,
            reason: 'contains failed',
            componentResults: [
              {
                pass: true,
                score: 12,
                reason: 'latency metric',
                assertion: { type: 'latency', metric: 'total_latency_ms' },
                metadata: { isMetricOnly: true },
              },
              {
                pass: false,
                score: 0,
                reason: 'missing not found',
                assertion: { type: 'contains', value: 'missing' },
              },
            ],
          },
        }),
      ],
      prompts: [{ label: 'hi', provider: 'test-provider', metrics: {} }],
    } as unknown as EvaluateSummaryV3;

    const { results } = formatEvaluationResults(summary);
    expect(results[0].assertions?.passedAssertions).toBe(0);
    expect(results[0].assertions?.failedAssertions).toBe(1);
  });
});
