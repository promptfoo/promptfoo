import type { EventSource } from './eventSource';
import type { EvaluateOptions, EvaluateResult, RunEvalOptions } from './index';
import type { TokenUsage } from './shared';

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  eventSource?: EventSource;
  /** CLI-owned graceful pause; ordinary caller cancellation retains its error rows. */
  pauseSignal?: AbortSignal;
  /** CLI recovery reuses saved columns; this is neither configurable nor persisted. */
  restorePromptColumns?: boolean;
  /** CLI retry verifies the planned cells and records durable replacements. */
  retryResults?: {
    prepare(steps: RunEvalOptions[], hasExtensions?: boolean): Promise<RunEvalOptions[]>;
    validate(step: RunEvalOptions): void;
    saved(row: Pick<EvaluateResult, 'provider' | 'testCase' | 'testIdx' | 'promptIdx'>): void;
  };
  generationEventId?: string;
  generationTokenUsage?: TokenUsage;
};
