import { createProviderResponse } from './provider';

import type { GradingResult, ProviderResponse } from '../../src/types/index';

export function createGradingResult(overrides: Partial<GradingResult> = {}): GradingResult {
  return {
    pass: true,
    score: 1,
    reason: 'Test grading output',
    ...overrides,
  };
}

export type PassingGradingResult = Readonly<GradingResult> & {
  readonly pass: true;
  readonly score: 1;
};

export type FailingGradingResult = Readonly<GradingResult> & {
  readonly pass: false;
  readonly score: 0;
};

// pass/score are locked after overrides so callers cannot accidentally flip
// a passing fixture to a failure (or vice versa). reason remains overridable.
export function createPassingGradingResult(
  overrides: Partial<GradingResult> = {},
): PassingGradingResult {
  return createGradingResult({ ...overrides, pass: true, score: 1 }) as PassingGradingResult;
}

export function createFailingGradingResult(
  overrides: Partial<GradingResult> = {},
): FailingGradingResult {
  return createGradingResult({
    reason: 'Grading failed reason',
    ...overrides,
    pass: false,
    score: 0,
  }) as FailingGradingResult;
}

export function createGradingProviderResponse(
  gradingResult: GradingResult = createPassingGradingResult(),
  overrides: Partial<ProviderResponse> = {},
): ProviderResponse {
  return createProviderResponse({
    output: JSON.stringify(gradingResult),
    ...overrides,
  });
}
