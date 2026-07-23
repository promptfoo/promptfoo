import type { EventSource } from './eventSource';
import type { EvaluateOptions, GradingResult } from './index';

export { isGradingResult, isResultFailureReason, ResultFailureReason } from './index';

export type {
  ApiProvider,
  AssertionSet,
  AtomicTestCase,
  EvaluateResult,
  GradingResult,
  Prompt,
  PromptMetrics,
  ProviderOptions,
  ProviderResponse,
  ScoringFunction,
} from './index';

type NonstandardScoringBaseline = { pass: boolean; score: number };
const NONSTANDARD_SCORING_BASELINE = Symbol('promptfoo.nonstandardScoringBaseline');

export function setNonstandardScoringBaseline(
  gradingResult: GradingResult,
  baseline: NonstandardScoringBaseline,
): void {
  Object.defineProperty(gradingResult, NONSTANDARD_SCORING_BASELINE, {
    configurable: true,
    enumerable: false,
    value: baseline,
    writable: true,
  });
}

export function getNonstandardScoringBaseline(
  gradingResult: GradingResult | null | undefined,
): NonstandardScoringBaseline | undefined {
  const baseline = gradingResult
    ? (
        gradingResult as GradingResult & {
          [NONSTANDARD_SCORING_BASELINE]?: NonstandardScoringBaseline;
        }
      )[NONSTANDARD_SCORING_BASELINE]
    : undefined;
  return baseline &&
    typeof baseline.pass === 'boolean' &&
    typeof baseline.score === 'number' &&
    Number.isFinite(baseline.score)
    ? baseline
    : undefined;
}

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  eventSource?: EventSource;
};
