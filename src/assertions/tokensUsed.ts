import { matchesPattern } from './traceUtils';

import type { AssertionParams, GradingResult } from '../types/index';
import type { TraceSpan } from '../types/tracing';

interface TokensUsedValue {
  max?: number;
  min?: number;
  pattern?: string;
  source?: 'trace' | 'response' | 'auto';
}

function positiveTokenValue(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function nonNegativeTokenValue(value: unknown): number | undefined {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
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

function tokensFromTrace(spans: TraceSpan[], pattern: string): number {
  const spansById = new Map(spans.map((span) => [span.spanId, span]));
  const matchedTokenSpans = spans
    .filter((span) => matchesPattern(span.name, pattern))
    .map((span) => ({ span, total: sumTokenAttributes(span.attributes) }))
    .filter(({ total }) => total > 0);
  const matchedTokenSpanIds = new Set(matchedTokenSpans.map(({ span }) => span.spanId));
  const ancestorTokenSpanIds = new Set<string>();

  for (const { span } of matchedTokenSpans) {
    let parentSpanId = span.parentSpanId;
    const visited = new Set<string>();
    while (parentSpanId && !visited.has(parentSpanId)) {
      visited.add(parentSpanId);
      if (matchedTokenSpanIds.has(parentSpanId)) {
        ancestorTokenSpanIds.add(parentSpanId);
      }
      parentSpanId = spansById.get(parentSpanId)?.parentSpanId;
    }
  }

  return matchedTokenSpans.reduce(
    (sum, { span, total }) => (ancestorTokenSpanIds.has(span.spanId) ? sum : sum + total),
    0,
  );
}

function tokensFromProviderResponse(params: AssertionParams): number {
  const usage = params.providerResponse?.tokenUsage;
  if (!usage) {
    throw new Error(
      'No token usage data available for tokens-used assertion from provider response',
    );
  }

  const total = nonNegativeTokenValue(usage.total);
  if (total !== undefined) {
    return total;
  }

  const prompt = nonNegativeTokenValue(usage.prompt);
  const completion = nonNegativeTokenValue(usage.completion);
  if (prompt === undefined && completion === undefined) {
    throw new Error(
      'No token usage data available for tokens-used assertion from provider response',
    );
  }

  return (prompt ?? 0) + (completion ?? 0);
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
      total: tokensFromTrace((trace.spans ?? []) as TraceSpan[], pattern),
      usedSource: 'trace',
    };
  }

  if (trace?.spans && trace.spans.length > 0) {
    return {
      total: tokensFromTrace(trace.spans as TraceSpan[], pattern),
      usedSource: 'trace',
    };
  }

  return { total: tokensFromProviderResponse(params), usedSource: 'response' };
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
    value.source &&
    value.source !== 'trace' &&
    value.source !== 'response' &&
    value.source !== 'auto'
  ) {
    throw new Error('tokens-used source must be "trace", "response", or "auto"');
  }

  const pattern = value.pattern ?? '*';
  const source = value.source ?? 'auto';
  const { total, usedSource } = resolveTokenUsage(params, source, pattern);

  const min = value.min;
  const max = value.max;
  const basePass = (min === undefined || total >= min) && (max === undefined || total <= max);
  const pass = params.inverse ? !basePass : basePass;

  let reason = `Tokens used: ${total} (source=${usedSource})`;
  if (min !== undefined && max !== undefined) {
    reason += ` — expected ${min}-${max}`;
  } else if (min !== undefined) {
    reason += ` — expected at least ${min}`;
  } else if (max !== undefined) {
    reason += ` — expected at most ${max}`;
  }
  if (params.inverse) {
    reason = basePass
      ? `tokens-used: ${total} satisfied the budget (source=${usedSource}), which violates the inverse assertion`
      : `tokens-used: ${total} did not satisfy the budget (source=${usedSource}) — inverse assertion passes`;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason,
    assertion: params.assertion,
  };
};
