import type { TraceContextData } from '../../tracing/traceContext';
import type { ProviderResponse } from '../../types/providers';
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
  traceData?: TraceData | null;
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  // Iteration/turn number for multi-turn evaluations.
  iteration?: number;
  // W3C trace context used to link grader spans to the target/evaluation trace.
  traceparent?: string;
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
