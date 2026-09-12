import type { AssertionOrSet, AtomicTestCase, ProviderResponse } from '../types';

export const TRACE_REDACTION_ASSERTIONS = new Set([
  'promptfoo:redteam:coding-agent:trace-redaction',
  'promptfoo:redteam:harness:artifact-redaction',
]);

export function requiresTraceRedaction(assertions: AssertionOrSet[] | undefined): boolean {
  return (
    assertions?.some((assertion) =>
      assertion.type === 'assert-set'
        ? requiresTraceRedaction(assertion.assert)
        : TRACE_REDACTION_ASSERTIONS.has(assertion.type.replace(/^not-/, '')),
    ) ?? false
  );
}

/** Keep unverified image pixels and their response echoes out of public result copies. */
export function sanitizeRedactionResult<T extends object>(input: T): T {
  const result = input as T & {
    testCase?: AtomicTestCase;
    response?: ProviderResponse | null;
    metadata?: Record<string, unknown>;
  };
  const response = result.response;
  if (!response?.images?.length || !requiresTraceRedaction(result.testCase?.assert)) {
    return input;
  }
  const metadata = { ...result.metadata };
  for (const key of Object.keys(response.metadata ?? {})) {
    delete metadata[key];
  }
  return {
    ...input,
    metadata,
    response: {
      output: '[Image response omitted: pixel redaction could not be verified.]',
      cached: response.cached,
      cost: response.cost,
      incurredCost: response.incurredCost,
      latencyMs: response.latencyMs,
      tokenUsage: response.tokenUsage,
      metadata: { redactionMediaOmitted: true },
    },
  };
}
