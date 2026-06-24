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
 * - `gen_ai.usage.reasoning.output_tokens` -> reasoning tokens (current)
 * - `gen_ai.usage.cache_read_input_tokens` -> cache-read input tokens (legacy)
 * - `gen_ai.usage.cache_read.input_tokens` -> cache-read input tokens (current)
 * - `gen_ai.usage.cache_creation_input_tokens` -> cache-creation input tokens (legacy)
 * - `gen_ai.usage.cache_creation.input_tokens` -> cache-creation input tokens (current)
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

function sumDefined(left: number | undefined, right: number | undefined): number | undefined {
  return right === undefined ? left : (left ?? 0) + right;
}

/** Aggregate fields while preserving undefined so a complementary source can fill gaps. */
function sumUsageRecords(usages: TokenUsage[]): TokenUsage {
  const result: TokenUsage = {};
  for (const usage of usages) {
    result.prompt = sumDefined(result.prompt, usage.prompt);
    result.completion = sumDefined(result.completion, usage.completion);
    result.cached = sumDefined(result.cached, usage.cached);
    result.total = sumDefined(result.total, usage.total);
    result.numRequests = sumDefined(result.numRequests, usage.numRequests);

    if (usage.completionDetails) {
      result.completionDetails ??= {};
      result.completionDetails.reasoning = sumDefined(
        result.completionDetails.reasoning,
        usage.completionDetails.reasoning,
      );
      result.completionDetails.acceptedPrediction = sumDefined(
        result.completionDetails.acceptedPrediction,
        usage.completionDetails.acceptedPrediction,
      );
      result.completionDetails.rejectedPrediction = sumDefined(
        result.completionDetails.rejectedPrediction,
        usage.completionDetails.rejectedPrediction,
      );
      result.completionDetails.cacheReadInputTokens = sumDefined(
        result.completionDetails.cacheReadInputTokens,
        usage.completionDetails.cacheReadInputTokens,
      );
      result.completionDetails.cacheCreationInputTokens = sumDefined(
        result.completionDetails.cacheCreationInputTokens,
        usage.completionDetails.cacheCreationInputTokens,
      );
    }
  }
  return result;
}

/** Keep authoritative values and fill only fields they do not report. */
function mergeComplementaryUsage(authoritative: TokenUsage, fallback: TokenUsage): TokenUsage {
  const authoritativeDetails = authoritative.completionDetails;
  const fallbackDetails = fallback.completionDetails;
  const completionDetails =
    authoritativeDetails || fallbackDetails
      ? {
          reasoning: authoritativeDetails?.reasoning ?? fallbackDetails?.reasoning,
          acceptedPrediction:
            authoritativeDetails?.acceptedPrediction ?? fallbackDetails?.acceptedPrediction,
          rejectedPrediction:
            authoritativeDetails?.rejectedPrediction ?? fallbackDetails?.rejectedPrediction,
          cacheReadInputTokens:
            authoritativeDetails?.cacheReadInputTokens ?? fallbackDetails?.cacheReadInputTokens,
          cacheCreationInputTokens:
            authoritativeDetails?.cacheCreationInputTokens ??
            fallbackDetails?.cacheCreationInputTokens,
        }
      : undefined;

  return {
    prompt: authoritative.prompt ?? fallback.prompt,
    completion: authoritative.completion ?? fallback.completion,
    cached: authoritative.cached ?? fallback.cached,
    total: authoritative.total ?? fallback.total,
    numRequests: authoritative.numRequests ?? fallback.numRequests,
    ...(completionDetails ? { completionDetails } : {}),
  };
}

const isProviderUsageGroup = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isTestUsageGroup = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const USAGE_GROUP_ATTRIBUTES = [
  { attribute: 'promptfoo.provider.id', isGroup: isProviderUsageGroup },
  { attribute: 'promptfoo.test.index', isGroup: isTestUsageGroup },
] as const;

function getInheritedSpanAttribute(
  span: SpanData,
  attribute: string,
  spansById: Map<string, SpanData>,
  isGroup: (value: unknown) => boolean,
): unknown {
  const visited = new Set<string>();
  let current: SpanData | undefined = span;
  while (current && !visited.has(current.spanId)) {
    const value = current.attributes?.[attribute];
    if (isGroup(value)) {
      return value;
    }
    visited.add(current.spanId);
    current = current.parentSpanId ? spansById.get(current.parentSpanId) : undefined;
  }
  return undefined;
}

function crossesUsageGroupBoundary(
  turnSpan: SpanData,
  parentSpan: SpanData,
  spansById: Map<string, SpanData>,
): boolean {
  return USAGE_GROUP_ATTRIBUTES.some(({ attribute, isGroup }) => {
    const turnValue = getInheritedSpanAttribute(turnSpan, attribute, spansById, isGroup);
    if (turnValue === undefined) {
      return false;
    }
    const parentValue = getInheritedSpanAttribute(parentSpan, attribute, spansById, isGroup);
    return parentValue !== undefined && turnValue !== parentValue;
  });
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
  const spansById = new Map(spans.map((span) => [span.spanId, span]));
  const usageBySpanId = new Map(
    spans
      .map((span) => [span.spanId, extractUsageFromSpan(span)] as const)
      .filter((entry): entry is readonly [string, TokenUsage] => entry[1] !== undefined),
  );
  const isValidTokenCount = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const hasCompletePrimaryUsage = (usage: TokenUsage): boolean =>
    isValidTokenCount(usage.prompt) && isValidTokenCount(usage.completion);
  const turnUsageByNearestNonTurnAncestor = new Map<string, TokenUsage[]>();
  const groupedTurnSpanIds = new Set<string>();

  for (const span of spans) {
    if (span.attributes?.['gen_ai.turn.index'] === undefined || !usageBySpanId.has(span.spanId)) {
      continue;
    }
    const visited = new Set<string>();
    let parentSpanId = span.parentSpanId;
    while (parentSpanId && !visited.has(parentSpanId)) {
      const parentSpan = spansById.get(parentSpanId);
      const parentUsage = usageBySpanId.get(parentSpanId);
      if (parentSpan && parentSpan.attributes?.['gen_ai.turn.index'] === undefined && parentUsage) {
        if (crossesUsageGroupBoundary(span, parentSpan, spansById)) {
          break;
        }
        const turnUsages = turnUsageByNearestNonTurnAncestor.get(parentSpanId) ?? [];
        turnUsages.push(usageBySpanId.get(span.spanId)!);
        turnUsageByNearestNonTurnAncestor.set(parentSpanId, turnUsages);
        groupedTurnSpanIds.add(span.spanId);
        break;
      }
      visited.add(parentSpanId);
      parentSpanId = parentSpan?.parentSpanId;
    }
  }

  for (const span of spans) {
    if (groupedTurnSpanIds.has(span.spanId)) {
      continue;
    }
    const usage = usageBySpanId.get(span.spanId);
    if (usage) {
      const turnUsages = turnUsageByNearestNonTurnAncestor.get(span.spanId);
      if (!turnUsages) {
        accumulateTokenUsage(result, usage);
        continue;
      }

      const turnUsage = sumUsageRecords(turnUsages);
      // Complete parent calls own primary totals and request count; their turn
      // spans only fill missing detail fields. For partial imported parents,
      // prefer the turn breakdown and retain complementary parent summaries.
      const mergedUsage = hasCompletePrimaryUsage(usage)
        ? mergeComplementaryUsage(usage, turnUsage)
        : mergeComplementaryUsage(turnUsage, usage);
      accumulateTokenUsage(result, mergedUsage);
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

  const getNumericAttribute = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      if (
        typeof attrs[key] === 'number' &&
        Number.isFinite(attrs[key]) &&
        (attrs[key] as number) >= 0
      ) {
        return attrs[key];
      }
    }
    return undefined;
  };

  // Check if this span has any GenAI usage attributes
  const hasUsageAttributes =
    getNumericAttribute('gen_ai.usage.input_tokens') !== undefined ||
    getNumericAttribute('gen_ai.usage.output_tokens') !== undefined ||
    getNumericAttribute('gen_ai.usage.total_tokens') !== undefined ||
    getNumericAttribute('gen_ai.usage.cached_tokens') !== undefined ||
    getNumericAttribute('gen_ai.usage.reasoning.output_tokens', 'gen_ai.usage.reasoning_tokens') !==
      undefined ||
    getNumericAttribute(
      'gen_ai.usage.cache_read.input_tokens',
      'gen_ai.usage.cache_read_input_tokens',
    ) !== undefined ||
    getNumericAttribute(
      'gen_ai.usage.cache_creation.input_tokens',
      'gen_ai.usage.cache_creation_input_tokens',
    ) !== undefined ||
    getNumericAttribute('gen_ai.usage.accepted_prediction_tokens') !== undefined ||
    getNumericAttribute('gen_ai.usage.rejected_prediction_tokens') !== undefined;

  if (!hasUsageAttributes) {
    return undefined;
  }

  const usage: TokenUsage = {
    numRequests: 1,
  };

  // Extract standard GenAI semantic convention attributes
  const input = getNumericAttribute('gen_ai.usage.input_tokens');
  if (input !== undefined) {
    usage.prompt = input;
  }
  const output = getNumericAttribute('gen_ai.usage.output_tokens');
  if (output !== undefined) {
    usage.completion = output;
  }
  const total = getNumericAttribute('gen_ai.usage.total_tokens');
  if (total !== undefined) {
    usage.total = total;
  }
  const cached = getNumericAttribute('gen_ai.usage.cached_tokens');
  if (cached !== undefined) {
    usage.cached = cached;
  }

  // Extract completion details (custom attributes)
  const hasCompletionDetails =
    attrs['gen_ai.usage.reasoning.output_tokens'] !== undefined ||
    attrs['gen_ai.usage.reasoning_tokens'] !== undefined ||
    attrs['gen_ai.usage.accepted_prediction_tokens'] !== undefined ||
    attrs['gen_ai.usage.rejected_prediction_tokens'] !== undefined ||
    attrs['gen_ai.usage.cache_read.input_tokens'] !== undefined ||
    attrs['gen_ai.usage.cache_read_input_tokens'] !== undefined ||
    attrs['gen_ai.usage.cache_creation.input_tokens'] !== undefined ||
    attrs['gen_ai.usage.cache_creation_input_tokens'] !== undefined;

  if (hasCompletionDetails) {
    usage.completionDetails = {};

    const reasoning = getNumericAttribute(
      'gen_ai.usage.reasoning.output_tokens',
      'gen_ai.usage.reasoning_tokens',
    );
    if (reasoning !== undefined) {
      usage.completionDetails.reasoning = reasoning;
    }
    const acceptedPrediction = getNumericAttribute('gen_ai.usage.accepted_prediction_tokens');
    if (acceptedPrediction !== undefined) {
      usage.completionDetails.acceptedPrediction = acceptedPrediction;
    }
    const rejectedPrediction = getNumericAttribute('gen_ai.usage.rejected_prediction_tokens');
    if (rejectedPrediction !== undefined) {
      usage.completionDetails.rejectedPrediction = rejectedPrediction;
    }
    const cacheRead = getNumericAttribute(
      'gen_ai.usage.cache_read.input_tokens',
      'gen_ai.usage.cache_read_input_tokens',
    );
    if (cacheRead !== undefined) {
      usage.completionDetails.cacheReadInputTokens = cacheRead;
    }
    const cacheCreation = getNumericAttribute(
      'gen_ai.usage.cache_creation.input_tokens',
      'gen_ai.usage.cache_creation_input_tokens',
    );
    if (cacheCreation !== undefined) {
      usage.completionDetails.cacheCreationInputTokens = cacheCreation;
    }
  }

  return usage;
}

function aggregateUsageByInheritedAttribute<Group extends string | number>(
  spans: SpanData[],
  attribute: string,
  isGroup: (value: unknown) => value is Group,
): Map<Group, TokenUsage> {
  const spansById = new Map(spans.map((span) => [span.spanId, span]));
  const groupBySpanId = new Map<string, Group | undefined>();

  const resolveGroup = (span: SpanData, visited: Set<string> = new Set()): Group | undefined => {
    if (groupBySpanId.has(span.spanId)) {
      return groupBySpanId.get(span.spanId);
    }
    if (visited.has(span.spanId)) {
      return undefined;
    }
    visited.add(span.spanId);

    const ownGroup = span.attributes?.[attribute];
    const group = isGroup(ownGroup)
      ? ownGroup
      : span.parentSpanId
        ? resolveGroup(spansById.get(span.parentSpanId) ?? span, visited)
        : undefined;
    groupBySpanId.set(span.spanId, group);
    return group;
  };

  const spansByGroup = new Map<Group, SpanData[]>();
  for (const span of spans) {
    const group = resolveGroup(span);
    if (group === undefined) {
      continue;
    }
    const groupedSpans = spansByGroup.get(group) ?? [];
    groupedSpans.push(span);
    spansByGroup.set(group, groupedSpans);
  }

  const usageByGroup = new Map<Group, TokenUsage>();
  for (const [group, groupedSpans] of spansByGroup) {
    const usage = aggregateUsageFromSpans(groupedSpans);
    if ((usage.numRequests ?? 0) > 0) {
      usageByGroup.set(group, usage);
    }
  }
  return usageByGroup;
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

  return aggregateUsageByInheritedAttribute(spans, 'promptfoo.provider.id', isProviderUsageGroup);
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

  return aggregateUsageByInheritedAttribute(spans, 'promptfoo.test.index', isTestUsageGroup);
}
