import { ResultFailureReason } from '../../src/types/index';

import type { EvaluateResult } from '../../src/types/index';

// Preserve the filter suites' stored values and absent optional fields.
export function createFilterTestResult(
  testIdx: number,
  overrides: Partial<EvaluateResult>,
): EvaluateResult {
  return {
    description: `test-${testIdx}`,
    promptIdx: 0,
    testIdx,
    testCase: { vars: { test: `value${testIdx}` } },
    promptId: 'test-prompt',
    provider: { id: 'test-provider', label: 'test-label' },
    prompt: { raw: 'Test prompt', label: 'Test prompt' },
    vars: { test: `value${testIdx}` },
    response: { output: `Response ${testIdx}` },
    error: null,
    failureReason: ResultFailureReason.NONE,
    success: true,
    score: 1,
    latencyMs: 100,
    gradingResult: overrides.gradingResult,
    namedScores: {},
    cost: 0.007,
    metadata: {},
    ...overrides,
  };
}
