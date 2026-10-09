import type { TraceContextData } from '../../tracing/traceContext';
import type {
  AssertionValue,
  AtomicTestCase,
  GradingResult,
  ResultSuggestion,
} from '../../types/index';
import type { ApiProvider, ImageOutput, ProviderResponse } from '../../types/providers';
import type { TraceData } from '../../types/tracing';
import type { RedteamHistoryEntry } from '../types';

/**
 * Shared grading context passed to redteam graders.
 *
 * Keep this in a provider/plugin-neutral leaf module to avoid import cycles
 * between redteam providers and plugin base classes.
 */
export interface RedteamGradingContext {
  providerResponse?: ProviderResponse;
  /** Whether the evaluated output was text before any implicit serialization. */
  outputIsText?: boolean;
  imageOutputs?: ImageOutput[];
  traceData?: TraceData | null;
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  // Prior multi-turn conversation context for graders that need provenance across turns.
  redteamHistory?: RedteamHistoryEntry[];
  conversationHistory?: Array<Pick<RedteamHistoryEntry, 'prompt' | 'output'>>;
  conversationTranscript?: string;
  // Data exfiltration tracking (for data-exfil grader)
  wasExfiltrated?: boolean;
  exfilCount?: number;
  exfilRecords?: Array<{
    timestamp: string;
    ip: string;
    userAgent: string;
    queryParams: Record<string, string>;
  }>;
}

/** Provider-facing grader contract, independent of the plugin base implementation. */
export interface RedteamGrader {
  readonly id: string;
  getResult(
    prompt: string,
    llmOutput: string,
    test: AtomicTestCase,
    provider: ApiProvider | undefined,
    renderedValue: AssertionValue | undefined,
    additionalRubric?: string,
    skipRefusalCheck?: boolean,
    gradingContext?: RedteamGradingContext,
  ): Promise<{
    grade: GradingResult;
    rubric: string;
    suggestions?: ResultSuggestion[];
  }>;
}
