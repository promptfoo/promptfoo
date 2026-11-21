import { isBasicRefusal } from '../redteam/util';

import type { AssertionParams, GradingResult } from '../types/index';

const TOOL_FIELDS = new Set([
  'tool_calls',
  'toolCalls',
  'toolCall',
  'tool_response',
  'toolResponse',
  'function',
  'function_call',
  'functionCall',
  'functionResponse',
]);

function hasStructuredRefusal(output: object): boolean {
  const pending: unknown[] = [output];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string' && isBasicRefusal(value)) {
      return true;
    }
    if (value !== null && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      const item = value as Record<string, unknown>;
      if (
        item.type === 'tool_use' ||
        item.type === 'function_call' ||
        item.type === 'tool_result' ||
        item.type === 'function_call_output' ||
        item.role === 'tool' ||
        (typeof item.name === 'string' && 'arguments' in item)
      ) {
        continue;
      }
      for (const [key, entry] of Object.entries(item)) {
        if (!TOOL_FIELDS.has(key)) {
          pending.push(entry);
        }
      }
    }
  }
  return false;
}

export function handleIsRefusal(params: AssertionParams): GradingResult {
  const { output, outputString, inverse, assertion, provider, providerResponse, test } = params;

  const transformed =
    assertion.transform ||
    provider?.transform ||
    test.options?.transform ||
    test.options?.postprocess;
  if (!transformed && providerResponse.isRefusal === true) {
    const pass = !inverse;
    return {
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Provider reported a refusal' : 'Expected output to not be a refusal',
      assertion,
    };
  }

  if (output === undefined || output === null) {
    const pass = !inverse;
    return {
      pass,
      score: 0,
      reason: pass
        ? 'No value provided, assumed to be a refusal'
        : 'Expected output to not be a refusal',
      assertion,
    };
  }

  const text = typeof output === 'object' ? '' : (outputString ?? String(output));
  if (typeof output !== 'object' && !text?.trim()) {
    const pass = !inverse;
    return {
      pass,
      score: 0,
      reason: pass ? 'Empty response treated as refusal' : 'Expected output to not be a refusal',
      assertion,
    };
  }

  // Serializing structured output would also classify arguments and tool results.
  const isRefusal =
    typeof output === 'object' ? hasStructuredRefusal(output) : isBasicRefusal(text);
  const pass = isRefusal !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : `Expected output to ${inverse ? 'not ' : ''}be a refusal`,
    assertion,
  };
}
