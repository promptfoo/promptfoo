import type { EventSource } from './eventSource';
import type { EvaluateOptions } from './index';
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
  /** IDs saved by the current retry, used to isolate grading and replacement. */
  retryReplacementIds?: Set<string>;
  generationEventId?: string;
  generationTokenUsage?: TokenUsage;
};
