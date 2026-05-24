import { matchesPattern } from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';

interface TokensUsedValue {
  max?: number;
  min?: number;
  pattern?: string;
  source?: 'trace' | 'response' | 'auto';
}

interface TraceTokenUsage {
  hasUsage: boolean;
  total: number;
}

const TOKEN_USAGE_ATTRIBUTE_KEYS = [
  'gen_ai.usage.total_tokens',
  'llm.usage.total_tokens',
  'tokens.used',
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'llm.usage.prompt_tokens',
  'llm.usage.completion_tokens',
  'tokens.prompt',
  'tokens.completion',
] as const;

function numericTokenValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return undefined;
}

function positiveTokenValue(value: unknown): number | undefined {
  const num = numericTokenValue(value);
  return num !== undefined && Number.isFinite(num) && num > 0 ? num : undefined;
}

function nonNegativeTokenValue(value: unknown): number | undefined {
  const num = numericTokenValue(value);
  return num !== undefined && Number.isFinite(num) && num >= 0 ? num : undefined;
}

function sumTokenFamily(
  attributes: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  const values = keys
    .map((key) => positiveTokenValue(attributes[key]))
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

function sumTokenAttributes(attributes: Record<string, unknown> | undefined): number {
  if (!attributes) {
    return 0;
  }

  const aggregateTotal =
    positiveTokenValue(attributes['gen_ai.usage.total_tokens']) ??
    positiveTokenValue(attributes['llm.usage.total_tokens']) ??
    positiveTokenValue(attributes['tokens.used']);
  if (aggregateTotal !== undefined) {
    return aggregateTotal;
  }

  return (
    sumTokenFamily(attributes, ['gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens']) ??
    sumTokenFamily(attributes, ['llm.usage.prompt_tokens', 'llm.usage.completion_tokens']) ??
    sumTokenFamily(attributes, ['tokens.prompt', 'tokens.completion']) ??
    0
  );
}

function hasTokenUsageAttributes(attributes: Record<string, unknown> | undefined): boolean {
  return (
    attributes !== undefined &&
    TOKEN_USAGE_ATTRIBUTE_KEYS.some(
      (attributeName) => nonNegativeTokenValue(attributes[attributeName]) !== undefined,
    )
  );
}

function tokensFromTrace(spans: TraceSpan[], pattern: string): TraceTokenUsage {
  const spansById = new Map(spans.map((span) => [span.spanId, span]));
  const matchedSpans = spans.filter((span) => matchesPattern(span.name, pattern));
  const matchedTokenSpans = matchedSpans
    .map((span) => ({ span, total: sumTokenAttributes(span.attributes) }))
    .filter(({ total }) => total > 0);
  const matchedTokenSpansById = new Map(
    matchedTokenSpans.map((tokenSpan) => [tokenSpan.span.spanId, tokenSpan]),
  );
  const descendantTokenSpanIdsById = new Map<string, string[]>();
  const rootTokenSpanIds: string[] = [];

  for (const { span } of matchedTokenSpans) {
    let parentSpanId = span.parentSpanId;
    const visited = new Set<string>();
    let matchedParentSpanId: string | undefined;
    while (parentSpanId && !visited.has(parentSpanId)) {
      visited.add(parentSpanId);
      if (matchedTokenSpansById.has(parentSpanId)) {
        matchedParentSpanId = parentSpanId;
        break;
      }
      parentSpanId = spansById.get(parentSpanId)?.parentSpanId;
    }

    if (!matchedParentSpanId) {
      rootTokenSpanIds.push(span.spanId);
      continue;
    }

    const descendants = descendantTokenSpanIdsById.get(matchedParentSpanId) ?? [];
    descendants.push(span.spanId);
    descendantTokenSpanIdsById.set(matchedParentSpanId, descendants);
  }

  const coveredTokens = (spanId: string, visited: Set<string>): number => {
    if (visited.has(spanId)) {
      return 0;
    }

    const tokenSpan = matchedTokenSpansById.get(spanId);
    if (!tokenSpan) {
      return 0;
    }

    const nextVisited = new Set(visited).add(spanId);
    const descendantTotal = (descendantTokenSpanIdsById.get(spanId) ?? []).reduce(
      (sum, descendantSpanId) => sum + coveredTokens(descendantSpanId, nextVisited),
      0,
    );
    return Math.max(tokenSpan.total, descendantTotal);
  };

  return {
    hasUsage: matchedSpans.some((span) => hasTokenUsageAttributes(span.attributes)),
    total: rootTokenSpanIds.reduce((sum, spanId) => sum + coveredTokens(spanId, new Set()), 0),
  };
}

function tokensFromProviderResponse(params: AssertionParams): number {
  const usage = params.providerResponse?.tokenUsage;
  if (!usage) {
    throw new Error(
      'No token usage data available for tokens-used assertion from provider response',
    );
  }

  const prompt = nonNegativeTokenValue(usage.prompt);
  const completion = nonNegativeTokenValue(usage.completion);
  const componentTotal =
    prompt === undefined && completion === undefined
      ? undefined
      : (prompt ?? 0) + (completion ?? 0);
  const total = nonNegativeTokenValue(usage.total);
  if (total !== undefined && (total > 0 || !componentTotal)) {
    return total;
  }

  if (componentTotal !== undefined) {
    return componentTotal;
  }

  throw new Error('No token usage data available for tokens-used assertion from provider response');
}

function resolveTokenUsage(
  params: AssertionParams,
  source: NonNullable<TokensUsedValue['source']>,
  pattern: string,
): { total: number; usedSource: 'trace' | 'response' } {
  const trace = params.assertionValueContext.trace;

  if (source === 'response') {
    return { total: tokensFromProviderResponse(params), usedSource: 'response' };
  }

  if (source === 'trace') {
    if (!trace) {
      throw new Error('No trace data available for tokens-used assertion (source: trace)');
    }
    return {
      total: tokensFromTrace((trace.spans ?? []) as TraceSpan[], pattern).total,
      usedSource: 'trace',
    };
  }

  if (trace?.spans && trace.spans.length > 0) {
    const traceUsage = tokensFromTrace(trace.spans as TraceSpan[], pattern);
    if (traceUsage.hasUsage || pattern !== '*') {
      return { total: traceUsage.total, usedSource: 'trace' };
    }
  }

  return { total: tokensFromProviderResponse(params), usedSource: 'response' };
}

function validateTokenBudgetBound(boundName: 'min' | 'max', value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`tokens-used ${boundName} must be a finite non-negative number`);
  }
  return value;
}

export const handleTokensUsed = (params: AssertionParams): GradingResult => {
  const value = (params.renderedValue ?? params.assertion.value) as TokensUsedValue | undefined;
  if (!value || typeof value !== 'object') {
    throw new Error('tokens-used assertion must have an object value');
  }

  if (value.min === undefined && value.max === undefined) {
    throw new Error('tokens-used assertion must include min or max');
  }

  if (
    value.source !== undefined &&
    value.source !== 'trace' &&
    value.source !== 'response' &&
    value.source !== 'auto'
  ) {
    throw new Error('tokens-used source must be "trace", "response", or "auto"');
  }

  if (value.pattern !== undefined && typeof value.pattern !== 'string') {
    throw new Error('tokens-used pattern must be a string');
  }

  const min = validateTokenBudgetBound('min', value.min);
  const max = validateTokenBudgetBound('max', value.max);
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error('tokens-used min must be less than or equal to max');
  }

  const pattern = value.pattern ?? '*';
  const source = value.source ?? 'auto';
  const { total, usedSource } = resolveTokenUsage(params, source, pattern);

  const basePass = (min === undefined || total >= min) && (max === undefined || total <= max);
  const pass = params.inverse ? !basePass : basePass;

  let reason = `Tokens used: ${total} (source=${usedSource})`;
  if (min !== undefined && max !== undefined) {
    reason += ` - expected ${min}-${max}`;
  } else if (min !== undefined) {
    reason += ` - expected at least ${min}`;
  } else if (max !== undefined) {
    reason += ` - expected at most ${max}`;
  }
  if (params.inverse) {
    reason = basePass
      ? `tokens-used: ${total} satisfied the budget (source=${usedSource}), which violates the inverse assertion`
      : `tokens-used: ${total} did not satisfy the budget (source=${usedSource}) - inverse assertion passes`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};
