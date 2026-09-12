import { BLOB_SCHEME } from '../blobs/constants';

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

export function hasRedactionMedia(response: ProviderResponse | null | undefined): boolean {
  const pending: unknown[] = [response];
  const seen = new Set<object>();
  let inspected = 0;
  while (pending.length) {
    if (++inspected > 10000) {
      return true;
    }
    const value = pending.pop();
    if (typeof value === 'string') {
      if (value.includes(BLOB_SCHEME) || /data:(?:audio|image)\/|<svg(?:\s|\/?>)/i.test(value)) {
        return true;
      }
      if (/^\s*[{[]/.test(value)) {
        try {
          pending.push(JSON.parse(value));
        } catch {
          // Plain text is checked by the text verifier.
        }
      }
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      const record = value as Record<string, unknown>;
      const audio = record.audio as ProviderResponse['audio'];
      if (
        record.redactionMediaOmitted === true ||
        record.isBase64 === true ||
        (typeof record.b64_json === 'string' && record.b64_json.length > 0) ||
        (Array.isArray(record.images) && record.images.length > 0) ||
        audio?.data ||
        audio?.blobRef
      ) {
        return true;
      }
      for (const [key, child] of Object.entries(record)) {
        if (value !== response || key !== 'raw') {
          pending.push(child);
        }
      }
    }
  }
  return false;
}

/** Keep raw provider data, unverified media, and response echoes out of public copies. */
export function sanitizeRedactionResult<T extends object>(input: T): T {
  const result = input as T & {
    testCase?: AtomicTestCase;
    response?: ProviderResponse | null;
    metadata?: Record<string, unknown>;
  };
  const response = result.response;
  if (!response || !requiresTraceRedaction(result.testCase?.assert)) {
    return input;
  }
  if (!hasRedactionMedia(response)) {
    return response.raw === undefined
      ? input
      : { ...input, response: { ...response, raw: undefined } };
  }
  const metadata = { ...result.metadata };
  for (const key of Object.keys(response.metadata ?? {})) {
    delete metadata[key];
  }
  return {
    ...input,
    metadata,
    response: {
      output: '[Media response omitted: image or audio redaction could not be verified.]',
      cached: response.cached,
      cost: response.cost,
      incurredCost: response.incurredCost,
      latencyMs: response.latencyMs,
      tokenUsage: response.tokenUsage,
      metadata: { redactionMediaOmitted: true },
    },
  };
}
