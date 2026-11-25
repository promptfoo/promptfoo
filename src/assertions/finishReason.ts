import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

// Provider-specific aliases map to the standard values documented for this
// assertion. Kept local so the core layer does not add a cross-layer edge.
const FINISH_REASON_ALIASES: Record<string, string> = {
  function_call: 'tool_calls',
  max_output_tokens: 'length',
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
  pause_turn: 'pause_turn',
  'tool-calls': 'tool_calls',
  'content-filter': 'content_filter',
};

function normalizeFinishReason(raw?: string | null): string | undefined {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const key = raw.trim().toLowerCase();
  return key === '' ? undefined : (FINISH_REASON_ALIASES[key] ?? key);
}

export function handleFinishReason({
  assertion,
  inverse = false,
  renderedValue,
  providerResponse,
}: AssertionParams): GradingResult {
  const value = renderedValue ?? assertion.value;
  invariant(typeof value === 'string', '"finish-reason" assertion type must have a string value');

  const normalizedValue = normalizeFinishReason(value);
  const normalizedFinishReason = normalizeFinishReason(providerResponse.finishReason);

  if (!normalizedFinishReason) {
    const pass = inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : 'Provider did not supply stop/finish reason',
      assertion,
    };
  }

  const pass = (normalizedValue === normalizedFinishReason) !== inverse;

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected finish reason ${inverse ? 'not ' : ''}"${value}" but got "${providerResponse.finishReason}"`,
    assertion,
  };
}
