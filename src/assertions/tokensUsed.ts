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
  return spans
    .filter((span) => matchesPattern(span.name, pattern))
    .reduce((sum, span) => sum + sumTokenAttributes(span.attributes), 0);
}

function tokensFromProviderResponse(params: AssertionParams): number {
  const usage = params.providerResponse?.tokenUsage;
  if (!usage) {
    return 0;
  }
  if (typeof usage.total === 'number' && usage.total > 0) {
    return usage.total;
  }
  const prompt = typeof usage.prompt === 'number' ? usage.prompt : 0;
  const completion = typeof usage.completion === 'number' ? usage.completion : 0;
  return prompt + completion;
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
  const trace = params.assertionValueContext.trace;
  const haveTrace = !!trace?.spans;

  let total = 0;
  let usedSource: 'trace' | 'response' = 'response';
  if (source === 'trace') {
    if (!haveTrace) {
      throw new Error('No trace data available for tokens-used assertion (source: trace)');
    }
    total = tokensFromTrace(trace!.spans as TraceSpan[], pattern);
    usedSource = 'trace';
  } else if (source === 'response') {
    total = tokensFromProviderResponse(params);
  } else {
    if (haveTrace) {
      total = tokensFromTrace(trace!.spans as TraceSpan[], pattern);
      usedSource = 'trace';
    } else {
      total = tokensFromProviderResponse(params);
      usedSource = 'response';
    }
  }

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
