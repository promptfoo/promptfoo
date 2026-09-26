import type { EventSource } from './eventSource';
import type { EvaluateOptions, RunEvalOptions } from './index';
import type { TokenUsage } from './shared';

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  eventSource?: EventSource;
  /** CLI options already resolved their delay; do not re-read an ambient default. */
  delayResolved?: boolean;
  generationEventId?: string;
  generationTokenUsage?: TokenUsage;
};

/** Preserve omitted pacing without changing the numeric public progress-callback field. */
export type InternalRunEvalOptions = RunEvalOptions & {
  delayOmitted?: boolean;
};
