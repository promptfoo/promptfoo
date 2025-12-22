import { getTraceStore } from '../tracing/store';
import { TokenUsageTracker } from './tokenUsage';
import { accumulateTokenUsage, createEmptyTokenUsage } from './tokenUsageUtils';

import type { SpanData } from '../tracing/store';
import type { TokenUsage } from '../types/shared';

/**
 * Query options for retrieving token usage from traces.
 */
export interface TokenUsageQuery {
  /** Filter by provider ID */
  providerId?: string;
  /** Filter by trace ID - retrieves usage from OTEL spans */
  traceId?: string;
  /** Filter by evaluation ID - aggregates usage across all traces in the evaluation */
  evalId?: string;
}

/**
 * Unified token usage interface that works with both legacy TokenUsageTracker
 * and new OTEL tracing infrastructure.
 *
 * This function provides a migration path from TokenUsageTracker to OTEL-based
 * token usage tracking. When querying by trace or evaluation ID, it reads from
 * OTEL span attributes. For provider-level queries, it falls back to the legacy
 * TokenUsageTracker.
 *
 * @param query - Query options to filter token usage
 * @returns Aggregated token usage matching the query criteria
 *
 * @example
 * ```typescript
 * // Get usage from a specific trace (OTEL)
 * const traceUsage = await getTokenUsage({ traceId: 'abc123' });
 *
 * // Get usage from an evaluation (OTEL, aggregated)
 * const evalUsage = await getTokenUsage({ evalId: 'eval-456' });
 *
 * // Get usage for a provider (legacy, cumulative)
 * const providerUsage = await getTokenUsage({ providerId: 'openai:gpt-4' });
 *
 * // Get total usage across all providers (legacy)
 * const totalUsage = await getTokenUsage({});
 * ```
 */
export async function getTokenUsage(query: TokenUsageQuery): Promise<TokenUsage> {
  // If querying by trace ID, use OTEL data
  if (query.traceId) {
    return getTokenUsageFromTrace(query.traceId);
  }

  // If querying by evaluation ID, aggregate across all traces
  if (query.evalId) {
    return getTokenUsageFromEvaluation(query.evalId);
  }

  // Fall back to legacy tracker for provider-level queries
  const tracker = TokenUsageTracker.getInstance();

  if (query.providerId) {
    return tracker.getProviderUsage(query.providerId) ?? createEmptyTokenUsage();
  }

  return tracker.getTotalUsage();
}

/**
 * Extract token usage from GenAI semantic convention attributes on OTEL spans.
 *
 * This function reads spans for a specific trace and extracts token usage
 * information from the standard GenAI semantic convention attributes:
 * - `gen_ai.usage.input_tokens` -> prompt tokens
 * - `gen_ai.usage.output_tokens` -> completion tokens
 * - `gen_ai.usage.total_tokens` -> total tokens
 * - `gen_ai.usage.cached_tokens` -> cached tokens
 * - `gen_ai.usage.reasoning_tokens` -> reasoning tokens
 * - `gen_ai.usage.accepted_prediction_tokens` -> accepted prediction tokens
 * - `gen_ai.usage.rejected_prediction_tokens` -> rejected prediction tokens
 *
 * @param traceId - The trace ID to retrieve usage for
 * @returns Aggregated token usage from all spans in the trace
 */
export async function getTokenUsageFromTrace(traceId: string): Promise<TokenUsage> {
  const store = getTraceStore();
  const spans = await store.getSpans(traceId, {
    sanitizeAttributes: false, // We need raw attributes to read token counts
    includeInternalSpans: true,
  });

  return aggregateUsageFromSpans(spans);
}

/**
 * Extract token usage from all traces in an evaluation.
 *
 * @param evalId - The evaluation ID to retrieve usage for
 * @returns Aggregated token usage from all spans across all traces in the evaluation
 */
export async function getTokenUsageFromEvaluation(evalId: string): Promise<TokenUsage> {
  const store = getTraceStore();
  const traces = await store.getTracesByEvaluation(evalId);

  const result = createEmptyTokenUsage();

  for (const trace of traces) {
    const spans = trace.spans as SpanData[];
    const traceUsage = aggregateUsageFromSpans(spans);
    accumulateTokenUsage(result, traceUsage);
  }

  return result;
}

/**
 * Aggregate token usage from a list of spans.
 *
 * Extracts GenAI semantic convention attributes from each span and
 * accumulates them into a single TokenUsage object.
 *
 * @param spans - Array of spans to extract usage from
 * @returns Aggregated token usage
 */
export function aggregateUsageFromSpans(spans: SpanData[]): TokenUsage {
  const result = createEmptyTokenUsage();

  for (const span of spans) {
    const usage = extractUsageFromSpan(span);
    if (usage) {
      accumulateTokenUsage(result, usage);
    }
  }

  return result;
}

/**
 * Extract token usage from a single span's attributes.
 *
 * @param span - The span to extract usage from
 * @returns Token usage if GenAI attributes are present, undefined otherwise
 */
export function extractUsageFromSpan(span: SpanData): TokenUsage | undefined {
  const attrs = span.attributes;
  if (!attrs) {
    return undefined;
  }

  // Check if this span has any GenAI usage attributes
  const hasUsageAttributes =
    attrs['gen_ai.usage.input_tokens'] !== undefined ||
    attrs['gen_ai.usage.output_tokens'] !== undefined ||
    attrs['gen_ai.usage.total_tokens'] !== undefined;

  if (!hasUsageAttributes) {
    return undefined;
  }

  const usage: TokenUsage = {
    numRequests: 1,
  };

  // Extract standard GenAI semantic convention attributes
  if (typeof attrs['gen_ai.usage.input_tokens'] === 'number') {
    usage.prompt = attrs['gen_ai.usage.input_tokens'];
  }
  if (typeof attrs['gen_ai.usage.output_tokens'] === 'number') {
    usage.completion = attrs['gen_ai.usage.output_tokens'];
  }
  if (typeof attrs['gen_ai.usage.total_tokens'] === 'number') {
    usage.total = attrs['gen_ai.usage.total_tokens'];
  }
  if (typeof attrs['gen_ai.usage.cached_tokens'] === 'number') {
    usage.cached = attrs['gen_ai.usage.cached_tokens'];
  }

  // Extract completion details (custom attributes)
  const hasCompletionDetails =
    attrs['gen_ai.usage.reasoning_tokens'] !== undefined ||
    attrs['gen_ai.usage.accepted_prediction_tokens'] !== undefined ||
    attrs['gen_ai.usage.rejected_prediction_tokens'] !== undefined;

  if (hasCompletionDetails) {
    usage.completionDetails = {};

    if (typeof attrs['gen_ai.usage.reasoning_tokens'] === 'number') {
      usage.completionDetails.reasoning = attrs['gen_ai.usage.reasoning_tokens'];
    }
    if (typeof attrs['gen_ai.usage.accepted_prediction_tokens'] === 'number') {
      usage.completionDetails.acceptedPrediction = attrs['gen_ai.usage.accepted_prediction_tokens'];
    }
    if (typeof attrs['gen_ai.usage.rejected_prediction_tokens'] === 'number') {
      usage.completionDetails.rejectedPrediction = attrs['gen_ai.usage.rejected_prediction_tokens'];
    }
  }

  return usage;
}

/**
 * Get token usage grouped by provider from spans in a trace.
 *
 * @param traceId - The trace ID to retrieve usage for
 * @returns Map of provider ID to token usage
 */
export async function getTokenUsageByProvider(traceId: string): Promise<Map<string, TokenUsage>> {
  const store = getTraceStore();
  const spans = await store.getSpans(traceId, {
    sanitizeAttributes: false,
    includeInternalSpans: true,
  });

  const usageByProvider = new Map<string, TokenUsage>();

  for (const span of spans) {
    const providerId = span.attributes?.['promptfoo.provider.id'] as string | undefined;
    if (!providerId) {
      continue;
    }

    const usage = extractUsageFromSpan(span);
    if (!usage) {
      continue;
    }

    const existing = usageByProvider.get(providerId) ?? createEmptyTokenUsage();
    accumulateTokenUsage(existing, usage);
    usageByProvider.set(providerId, existing);
  }

  return usageByProvider;
}

/**
 * Get token usage grouped by test index from spans in a trace.
 *
 * @param traceId - The trace ID to retrieve usage for
 * @returns Map of test index to token usage
 */
export async function getTokenUsageByTestIndex(traceId: string): Promise<Map<number, TokenUsage>> {
  const store = getTraceStore();
  const spans = await store.getSpans(traceId, {
    sanitizeAttributes: false,
    includeInternalSpans: true,
  });

  const usageByTest = new Map<number, TokenUsage>();

  for (const span of spans) {
    const testIndex = span.attributes?.['promptfoo.test.index'] as number | undefined;
    if (testIndex === undefined) {
      continue;
    }

    const usage = extractUsageFromSpan(span);
    if (!usage) {
      continue;
    }

    const existing = usageByTest.get(testIndex) ?? createEmptyTokenUsage();
    accumulateTokenUsage(existing, usage);
    usageByTest.set(testIndex, existing);
  }

  return usageByTest;
}
