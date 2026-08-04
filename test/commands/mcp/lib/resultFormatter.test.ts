import { describe, expect, it } from 'vitest';
import { formatEvaluationResults } from '../../../../src/commands/mcp/lib/resultFormatter';

import type { EvaluateSummaryV2 } from '../../../../src/types';

// Regression coverage for fallback-chain diagnostic components. When an `equals`
// primary fails and its `contains` fallback passes, the flattened
// componentResults are emitted as [contains(pass), equals(diagnostic fail)] —
// their order no longer aligns with `testCase.assert`, and the diagnostic is
// tagged `fallbackIntermediate`.
function buildSummaryWithFallbackDiagnostic(): EvaluateSummaryV2 {
  const gradingResult = {
    pass: true,
    score: 1,
    reason: 'All assertions passed',
    componentResults: [
      {
        // Terminal fallback (config index 1) surfaced first after flattening.
        pass: true,
        score: 1,
        reason: 'Expected output to contain "test"',
        assertion: { type: 'contains', value: 'test', metric: 'contains-metric' },
      },
      {
        // Failed primary (config index 0), retained only as a diagnostic.
        pass: false,
        score: 0,
        reason: 'Expected output to equal "nope"',
        assertion: { type: 'equals', value: 'nope', metric: 'equals-metric' },
        metadata: { fallbackIntermediate: true as const },
      },
    ],
  };

  return {
    version: 2,
    timestamp: new Date().toISOString(),
    results: [
      {
        provider: { id: 'echo' },
        prompt: { raw: 'prompt', label: 'prompt' },
        vars: {},
        response: { output: 'test output' },
        success: true,
        score: 1,
        namedScores: {},
        latencyMs: 1,
        testCase: {
          assert: [
            { type: 'equals', value: 'nope', fallback: 'next', metric: 'equals-metric' },
            { type: 'contains', value: 'test', metric: 'contains-metric' },
          ],
        },
        gradingResult,
      },
    ],
    stats: {
      successes: 1,
      failures: 0,
      errors: 0,
      tokenUsage: {},
    },
    table: { head: { prompts: [], vars: [] }, body: [] },
  } as unknown as EvaluateSummaryV2;
}

describe('resultFormatter fallback diagnostics', () => {
  it('labels components by their own assertion and excludes fallback diagnostics', () => {
    const { results } = formatEvaluationResults(buildSummaryWithFallbackDiagnostic());
    const assertions = results[0].assertions;

    expect(assertions).not.toBeNull();
    // The diagnostic fallbackIntermediate component is excluded from the
    // scoring projection.
    expect(assertions?.componentResults).toHaveLength(1);
    expect(assertions?.passedAssertions).toBe(1);
    expect(assertions?.failedAssertions).toBe(0);

    // Label is taken from the component's own assertion, NOT joined by config
    // index (which would mislabel the passing `contains` as `equals`).
    const [component] = assertions!.componentResults;
    expect(component.type).toBe('contains');
    expect(component.metric).toBe('contains-metric');
    expect(component.pass).toBe(true);
  });
});
