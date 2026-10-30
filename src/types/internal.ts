import type { EventSource } from './eventSource';
import type { AtomicTestCase, EvaluateOptions, ExactHistoricalSource, TestSuite } from './index';
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
  generationEventId?: string;
  generationTokenUsage?: TokenUsage;
  /** CLI-only exact metadata/history selection after current variable preparation. */
  exactHistoricalSelection?: {
    eligible: (
      candidates: PreparedHistoricalCandidate[],
      suite: TestSuite,
    ) => Promise<PreparedHistoricalCandidate[]>;
    select: (
      candidates: PreparedHistoricalCandidate[],
      suite: TestSuite,
    ) => Promise<PreparedHistoricalCandidate[]>;
    writeEnabled: boolean;
  };
};

export interface PreparedHistoricalCandidate {
  test: AtomicTestCase;
  source: ExactHistoricalSource;
}
