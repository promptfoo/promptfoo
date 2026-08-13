import { getTraceStore } from '../tracing/store';
import { TokenUsageTracker } from './tokenUsage';
import { accumulateTokenUsage, createEmptyTokenUsage } from './tokenUsageUtils';

import type { SpanData } from '../tracing/store';
import type { TokenUsage } from '../types/shared';

const TOKEN_USAGE_ATTRIBUTES = [
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.total_tokens',
  'gen_ai.usage.cached_tokens',
  'gen_ai.usage.reasoning_tokens',
  'gen_ai.usage.reasoning.output_tokens',
  'gen_ai.usage.cache_read_input_tokens',
  'gen_ai.usage.cache_read.input_tokens',
  'gen_ai.usage.cache_creation_input_tokens',
  'gen_ai.usage.cache_creation.input_tokens',
  'gen_ai.usage.accepted_prediction_tokens',
  'gen_ai.usage.rejected_prediction_tokens',
  'promptfoo.usage.total_tokens',
  'promptfoo.usage.cached_response_tokens',
  'promptfoo.usage.accepted_prediction_tokens',
  'promptfoo.usage.rejected_prediction_tokens',
] as const;

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
 * - `gen_ai.usage.reasoning.output_tokens` -> reasoning tokens
 * - `gen_ai.usage.cache_read.input_tokens` -> provider prompt-cache reads
 * - `gen_ai.usage.cache_creation.input_tokens` -> provider prompt-cache writes
 *
 * Promptfoo-specific measurements use the `promptfoo.usage.*` namespace.
 * Historical `gen_ai.usage.*` variants remain readable for existing traces.
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
  const traces = await store.getTracesByEvaluation(evalId, {
    sanitizeAttributes: false, // We need raw attributes to read token counts
  });

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

  // Detail-only spans are valid too; external exporters may omit aggregate counts.
  const hasUsageAttributes = TOKEN_USAGE_ATTRIBUTES.some((attribute) => {
    return typeof attrs[attribute] === 'number';
  });

  if (!hasUsageAttributes) {
    return undefined;
  }

  const usage: TokenUsage = {
    numRequests: 1,
  };

  // Extract standard GenAI semantic convention attributes
  const readNumericAttribute = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = attrs[key];
      if (typeof value === 'number') {
        return value;
      }
    }
    return undefined;
  };

  const prompt = readNumericAttribute('gen_ai.usage.input_tokens');
  const completion = readNumericAttribute('gen_ai.usage.output_tokens');
  const total = readNumericAttribute('promptfoo.usage.total_tokens', 'gen_ai.usage.total_tokens');
  if (prompt !== undefined) {
    usage.prompt = prompt;
  }
  if (completion !== undefined) {
    usage.completion = completion;
  }
  if (total !== undefined) {
    usage.total = total;
  } else if (prompt !== undefined && completion !== undefined) {
    usage.total = prompt + completion;
  }
  const cached = readNumericAttribute(
    'promptfoo.usage.cached_response_tokens',
    'gen_ai.usage.cached_tokens',
  );
  if (cached !== undefined) {
    usage.cached = cached;
  }

  const reasoning = readNumericAttribute(
    'gen_ai.usage.reasoning.output_tokens',
    'gen_ai.usage.reasoning_tokens',
  );
  const acceptedPrediction = readNumericAttribute(
    'promptfoo.usage.accepted_prediction_tokens',
    'gen_ai.usage.accepted_prediction_tokens',
  );
  const rejectedPrediction = readNumericAttribute(
    'promptfoo.usage.rejected_prediction_tokens',
    'gen_ai.usage.rejected_prediction_tokens',
  );
  const cacheReadInputTokens = readNumericAttribute(
    'gen_ai.usage.cache_read.input_tokens',
    'gen_ai.usage.cache_read_input_tokens',
  );
  const cacheCreationInputTokens = readNumericAttribute(
    'gen_ai.usage.cache_creation.input_tokens',
    'gen_ai.usage.cache_creation_input_tokens',
  );

  if (
    reasoning !== undefined ||
    acceptedPrediction !== undefined ||
    rejectedPrediction !== undefined ||
    cacheReadInputTokens !== undefined ||
    cacheCreationInputTokens !== undefined
  ) {
    usage.completionDetails = {};
    if (reasoning !== undefined) {
      usage.completionDetails.reasoning = reasoning;
    }
    if (acceptedPrediction !== undefined) {
      usage.completionDetails.acceptedPrediction = acceptedPrediction;
    }
    if (rejectedPrediction !== undefined) {
      usage.completionDetails.rejectedPrediction = rejectedPrediction;
    }
    if (cacheReadInputTokens !== undefined) {
      usage.completionDetails.cacheReadInputTokens = cacheReadInputTokens;
    }
    if (cacheCreationInputTokens !== undefined) {
      usage.completionDetails.cacheCreationInputTokens = cacheCreationInputTokens;
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
