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
      if (
        value.includes(BLOB_SCHEME) ||
        /data:(?:audio|image|video)\/|<svg(?:\s|\/?>)/i.test(value)
      ) {
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
      const video = record.video as ProviderResponse['video'];
      if (
        record.redactionMediaOmitted === true ||
        record.isBase64 === true ||
        (typeof record.b64_json === 'string' && record.b64_json.length > 0) ||
        (Array.isArray(record.images) && record.images.length > 0) ||
        audio?.id ||
        audio?.data ||
        audio?.blobRef ||
        (video && Object.values(video).some(Boolean))
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

/** Keep privacy-check response bodies and their echoes out of public result copies. */
export function sanitizeRedactionResult<T extends object>(input: T): T {
  const result = input as T & {
    testCase?: AtomicTestCase;
    response?: ProviderResponse | null;
    metadata?: Record<string, unknown>;
    error?: string | null;
    tokenUsage?: unknown;
    cost?: unknown;
    incurredCost?: unknown;
    latencyMs?: unknown;
  };
  const response = result.response;
  if (!requiresTraceRedaction(result.testCase?.assert)) {
    return input;
  }
  // Provider-reported numbers can carry private receipts just like text fields.
  const accounting = {
    tokenUsage: undefined,
    cost: undefined,
    incurredCost: undefined,
    latencyMs: undefined,
  };
  const mediaOmitted = hasRedactionMedia(response);
  const metadata = { ...result.metadata };
  for (const key of Object.keys(response?.metadata ?? {})) {
    if (
      result.testCase?.metadata &&
      Object.prototype.hasOwnProperty.call(result.testCase.metadata, key)
    ) {
      metadata[key] = result.testCase.metadata[key];
    } else {
      delete metadata[key];
    }
  }
  delete metadata.errorContext;
  delete metadata.sessionId;
  const error = result.error ? 'Error details omitted for trace/artifact redaction.' : result.error;
  if (!response) {
    return { ...input, ...accounting, error, metadata };
  }
  return {
    ...input,
    ...accounting,
    error,
    metadata,
    response: {
      output: mediaOmitted
        ? '[Media response omitted: image, audio, or video redaction could not be verified.]'
        : '[Response omitted for trace/artifact redaction.]',
      ...(response.error && { error: 'Error details omitted for trace/artifact redaction.' }),
      cached: typeof response.cached === 'boolean' ? response.cached : undefined,
      metadata: mediaOmitted ? { redactionMediaOmitted: true } : { redactionContentOmitted: true },
    },
  };
}
