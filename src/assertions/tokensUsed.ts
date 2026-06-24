import { renderVarsInObject } from '../util/render';
import { isNunjucksOutputExpression, tokensUsedConfigError } from '../util/traceAssertionConfig';
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

  const candidateTotals = [
    positiveTokenValue(attributes['gen_ai.usage.total_tokens']),
    positiveTokenValue(attributes['llm.usage.total_tokens']),
    positiveTokenValue(attributes['tokens.used']),
    sumTokenFamily(attributes, ['gen_ai.usage.input_tokens', 'gen_ai.usage.output_tokens']),
    sumTokenFamily(attributes, ['llm.usage.prompt_tokens', 'llm.usage.completion_tokens']),
    sumTokenFamily(attributes, ['tokens.prompt', 'tokens.completion']),
  ].filter((value): value is number => value !== undefined);

  return candidateTotals.length > 0 ? Math.max(...candidateTotals) : 0;
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
  const matchedSpans = spans.filter((span) => matchesPattern(span.name, pattern));

  return {
    hasUsage: matchedSpans.some((span) => hasTokenUsageAttributes(span.attributes)),
    // OpenTelemetry usage belongs to the individual GenAI operation span. Parentage alone
    // does not establish that one span aggregates another, so summing is the only safe budget.
    total: matchedSpans.reduce((sum, span) => sum + sumTokenAttributes(span.attributes), 0),
  };
}

function tokensFromProviderResponse(params: AssertionParams): number | undefined {
  const usage = params.providerResponse?.tokenUsage;
  if (!usage) {
    return undefined;
  }

  const prompt = nonNegativeTokenValue(usage.prompt);
  const completion = nonNegativeTokenValue(usage.completion);
  const componentTotal =
    prompt === undefined && completion === undefined
      ? undefined
      : (prompt ?? 0) + (completion ?? 0);
  const total = nonNegativeTokenValue(usage.total);
  if (total !== undefined && componentTotal !== undefined) {
    return Math.max(total, componentTotal);
  }

  if (total !== undefined) {
    return total;
  }

  if (componentTotal !== undefined) {
    return componentTotal;
  }

  return undefined;
}

function resolveTokenUsage(
  params: AssertionParams,
  source: NonNullable<TokensUsedValue['source']>,
  pattern: string,
): { total: number; usedSource: 'trace' | 'response' } {
  const trace = params.assertionValueContext.trace;
  const responseTotal = tokensFromProviderResponse(params);

  if (source === 'response') {
    if (responseTotal === undefined) {
      throw new Error(
        'No token usage data available for tokens-used assertion from provider response',
      );
    }
    return { total: responseTotal, usedSource: 'response' };
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

  if (pattern !== '*') {
    if (!trace?.spans || trace.spans.length === 0) {
      throw new Error(
        `No trace token usage available for tokens-used assertion matching pattern "${pattern}"`,
      );
    }
    const traceUsage = tokensFromTrace(trace.spans as TraceSpan[], pattern);
    if (!traceUsage.hasUsage) {
      throw new Error(
        `No trace token usage available for tokens-used assertion matching pattern "${pattern}"`,
      );
    }
    return { total: traceUsage.total, usedSource: 'trace' };
  }

  if (trace?.spans && trace.spans.length > 0) {
    const traceUsage = tokensFromTrace(trace.spans as TraceSpan[], pattern);
    if (traceUsage.hasUsage) {
      return responseTotal !== undefined && responseTotal > traceUsage.total
        ? { total: responseTotal, usedSource: 'response' }
        : { total: traceUsage.total, usedSource: 'trace' };
    }
  }

  if (responseTotal !== undefined) {
    return { total: responseTotal, usedSource: 'response' };
  }

  throw new Error('No token usage data available for tokens-used assertion from provider response');
}

function coerceRenderedBudgetBound(rawValue: unknown, renderedValue: unknown): unknown {
  if (
    !isNunjucksOutputExpression(rawValue) ||
    typeof renderedValue !== 'string' ||
    !renderedValue.trim()
  ) {
    return renderedValue;
  }

  const numericValue = Number(renderedValue);
  return Number.isFinite(numericValue) ? numericValue : renderedValue;
}

export const handleTokensUsed = (params: AssertionParams): GradingResult => {
  const rawValue = params.assertion.value;
  const unrenderedValue = params.renderedValue ?? params.assertion.value;
  const renderedValue =
    params.valueFromScript === undefined
      ? renderVarsInObject(unrenderedValue, params.assertionValueContext.vars)
      : unrenderedValue;
  if (!renderedValue || typeof renderedValue !== 'object' || Array.isArray(renderedValue)) {
    throw new Error('tokens-used assertion must have an object value');
  }

  const rawObject =
    rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
      ? (rawValue as Record<string, unknown>)
      : {};
  const value = {
    ...(renderedValue as Record<string, unknown>),
    min: coerceRenderedBudgetBound(rawObject.min, (renderedValue as Record<string, unknown>).min),
    max: coerceRenderedBudgetBound(rawObject.max, (renderedValue as Record<string, unknown>).max),
  } as TokensUsedValue;

  const configError = tokensUsedConfigError(value);
  if (configError) {
    throw new Error(configError);
  }

  const { min, max } = value;
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
