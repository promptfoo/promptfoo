import type { TraceContextData } from '../../tracing/traceContext';
import type { ImageOutput, ProviderResponse } from '../../types/providers';
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
  imageOutputs?: ImageOutput[];
  traceData?: TraceData | null;
  traceContext?: TraceContextData | null;
  traceSummary?: string;
  // Prior multi-turn conversation context for graders that need provenance across turns.
  redteamHistory?: RedteamHistoryEntry[];
  conversationHistory?: Array<Pick<RedteamHistoryEntry, 'prompt' | 'output'>>;
  conversationTranscript?: string;
  // Opt in to shared rendering after the strategy has selected its grading history.
  includeConversationTranscript?: boolean;
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
