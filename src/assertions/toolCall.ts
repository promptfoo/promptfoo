import { isDeepStrictEqual } from 'node:util';

import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

/** Only complete request metadata can replace output; execution logs may omit pending calls. */
export function getToolCallInput({
  assertion,
  output,
  providerResponse,
}: Pick<AssertionParams, 'assertion' | 'output' | 'providerResponse'>): unknown {
  const metadata = providerResponse?.metadata;
  return !assertion.transform &&
    metadata?.toolCallsComplete === true &&
    metadata &&
    Object.prototype.hasOwnProperty.call(metadata, 'toolCalls')
    ? metadata.toolCalls
    : output;
}

type ExpectedCall = { name: string; arguments?: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveExpected(value: unknown): ExpectedCall[] {
  const values = Array.isArray(value) ? value : [value];
  invariant(values.length > 0, 'tool-call requires at least one expected tool');
  return values.map((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return { name: entry.trim() };
    }
    invariant(
      isRecord(entry) && typeof entry.name === 'string' && entry.name.trim(),
      'tool-call requires tool names or objects with a nonempty name',
    );
    invariant(
      Object.keys(entry).every((key) => key === 'name' || key === 'arguments'),
      'tool-call expectations only support name and arguments',
    );
    invariant(
      !Object.prototype.hasOwnProperty.call(entry, 'arguments') || isRecord(entry.arguments),
      'tool-call arguments must be a key-value object',
    );
    return {
      name: entry.name.trim(),
      ...(Object.prototype.hasOwnProperty.call(entry, 'arguments')
        ? { arguments: entry.arguments as Record<string, unknown> }
        : {}),
    };
  });
}

export const handleToolCall = (params: AssertionParams): GradingResult => {
  const { assertion, inverse } = params;
  const expected = resolveExpected(params.renderedValue);
  const requireCompleted = assertion.config?.requireCompleted;
  invariant(
    requireCompleted === undefined || typeof requireCompleted === 'boolean',
    'tool-call config.requireCompleted must be a boolean',
  );
  const calls = getToolCallInput(params);
  // Missing/malformed evidence must not satisfy a negative assertion either.
  if (
    !Array.isArray(calls) ||
    !calls.every((call) => isRecord(call) && typeof call.name === 'string' && call.name.trim())
  ) {
    return {
      pass: false,
      score: 0,
      reason: 'No valid tool-call records available. Enable tool-call metadata on the provider.',
      assertion,
    };
  }
  const matches = expected.map((wanted) =>
    calls.some((call) => {
      if (call.name !== wanted.name) {
        return false;
      }
      if (
        requireCompleted &&
        !(
          call.resultPresent === true &&
          call.resultStatus === 'completed' &&
          call.executionMode === 'real'
        )
      ) {
        return false;
      }
      return (
        wanted.arguments === undefined ||
        (isRecord(call.arguments) &&
          Object.entries(wanted.arguments).every(
            ([key, value]) =>
              Object.prototype.hasOwnProperty.call(call.arguments, key) &&
              isDeepStrictEqual(call.arguments[key], value),
          ))
      );
    }),
  );
  const pass = inverse ? matches.every((matched) => !matched) : matches.every(Boolean);
  const unmatched = expected.filter((_call, index) => (inverse ? matches[index] : !matches[index]));
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Tool-call expectations satisfied'
      : `Tool-call expectations ${inverse ? 'unexpectedly matched' : 'not matched'}: ${unmatched.map((call) => call.name).join(', ')}`,
    assertion,
  };
};
