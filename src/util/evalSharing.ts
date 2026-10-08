import { isDeepStrictEqual } from 'node:util';

import { getStripFlags, serializeResultForJsonlArtifact } from '../models/evalResult';
import { serializeEvalValue } from './evalSerialization';
import { isSecretField, REDACTED, sanitizeObject } from './sanitizer';

import type { ProviderResponse } from '../types';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// Known transport metadata excluded from shared reports. Local results retain these values.
const SENSITIVE_RESPONSE_HEADER_NAMES = new Set<string>([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'openai-organization',
  'openai-project',
  'openai-version',
  'x-request-id',
  'x-amzn-requestid',
  'x-amzn-trace-id',
  'x-amz-security-token',
  'x-amz-cf-id',
  'x-azure-ref',
  'x-correlation-id',
  'x-trace-id',
  'cf-ray',
  'cf-cache-status',
  'x-openai-proxy-wasm',
  'via',
]);

const SENSITIVE_RESPONSE_HEADER_PREFIXES = ['x-ratelimit-'];

function isSensitiveResponseHeader(headerName: string): boolean {
  const normalized = headerName.toLowerCase();
  if (SENSITIVE_RESPONSE_HEADER_NAMES.has(normalized)) {
    return true;
  }
  return SENSITIVE_RESPONSE_HEADER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Request headers can carry credentials the response-header list doesn't enumerate
// (api-key / x-api-key / x-auth-token / bearer …); fold in the shared secret-field matcher.
function isSensitiveRequestHeader(headerName: string): boolean {
  return isSensitiveResponseHeader(headerName) || isSecretField(headerName);
}

// Redact sensitive headers, but only when the value originates from `sourceHeaders` (the
// transport headers). The provenance check matters for the legacy top-level `metadata.headers`
// slot, which also holds arbitrary user metadata: a header is redacted only if it deep-equals
// the value the transport actually sent. For the canonical `metadata.http.*` slots the source
// is the slot itself, so the guard reduces to the plain name check.
function redactSensitiveHeaders(
  headers: Record<string, unknown>,
  sourceHeaders: Record<string, unknown> = headers,
  isSensitiveHeader: (headerName: string) => boolean = isSensitiveResponseHeader,
): Record<string, unknown> | null {
  let mutated = false;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (
      Object.prototype.hasOwnProperty.call(sourceHeaders, key) &&
      isDeepStrictEqual(sourceHeaders[key], value) &&
      isSensitiveHeader(key)
    ) {
      next[key] = REDACTED;
      mutated = true;
    } else {
      next[key] = value;
    }
  }
  return mutated ? next : null;
}

// Redact transport headers on a single metadata object. Providers populate
// `metadata.http.headers` / `requestHeaders`, while some legacy integrations still use a
// top-level `metadata.headers`. The legacy slot is only redacted when its transport source
// is known (`redactLegacyHeaders` for a response's own metadata, or `legacyHeadersSource` for
// result-level metadata that echoes the response) because top-level result metadata also holds
// arbitrary user-authored test metadata. Does NOT recurse into other keys (e.g. `output`,
// `audio`, arbitrary model output) — walking arbitrary subtrees risks rewriting user-controlled
// content that legitimately uses an `http` key (see
// https://github.com/promptfoo/promptfoo/pull/8876#issuecomment-4315002350).
function redactHttpHeadersOnMetadata<T>(
  metadata: T,
  options?: { legacyHeadersSource?: unknown; redactLegacyHeaders?: boolean },
): T {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return metadata;
  }

  const m = metadata as Record<string, unknown>;
  let nextMetadata: Record<string, unknown> | undefined;

  const legacyHeaders = m.headers;
  const legacyHeadersSource = options?.redactLegacyHeaders
    ? legacyHeaders
    : (options?.legacyHeadersSource as Record<string, unknown> | undefined)?.headers;
  if (
    legacyHeaders &&
    typeof legacyHeaders === 'object' &&
    !Array.isArray(legacyHeaders) &&
    legacyHeadersSource &&
    typeof legacyHeadersSource === 'object' &&
    !Array.isArray(legacyHeadersSource)
  ) {
    // The legacy slot mirrors transport request/response headers, so use the request-header
    // matcher (a strict superset) — otherwise api-key / x-auth-token / bearer would be redacted
    // in metadata.http.requestHeaders but leak in cleartext here.
    const redacted = redactSensitiveHeaders(
      legacyHeaders as Record<string, unknown>,
      legacyHeadersSource as Record<string, unknown>,
      isSensitiveRequestHeader,
    );
    if (redacted) {
      nextMetadata = { ...m, headers: redacted };
    }
  }

  const http = m.http;
  if (!http || typeof http !== 'object' || Array.isArray(http)) {
    return (nextMetadata ?? metadata) as T;
  }

  const httpRecord = http as Record<string, unknown>;
  let nextHttp: Record<string, unknown> | undefined;

  for (const slot of ['headers', 'requestHeaders'] as const) {
    const slotValue = httpRecord[slot];
    if (slotValue && typeof slotValue === 'object' && !Array.isArray(slotValue)) {
      const redacted =
        slot === 'requestHeaders'
          ? redactSensitiveHeaders(
              slotValue as Record<string, unknown>,
              slotValue as Record<string, unknown>,
              isSensitiveRequestHeader,
            )
          : redactSensitiveHeaders(slotValue as Record<string, unknown>);
      if (redacted) {
        nextHttp ??= { ...httpRecord };
        nextHttp[slot] = redacted;
      }
    }
  }

  if (!nextHttp) {
    return (nextMetadata ?? metadata) as T;
  }
  nextMetadata ??= { ...m };
  nextMetadata.http = nextHttp;
  return nextMetadata as T;
}

// Walk a `GradingResult`-shaped value and redact `metadata.http` on the result and
// every nested `componentResults[]`. Limits recursion to the documented schema
// (`componentResults` only) — does not descend into arbitrary subtrees.
function redactHttpHeadersOnGradingResult<T>(gradingResult: T): T {
  if (!gradingResult || typeof gradingResult !== 'object' || Array.isArray(gradingResult)) {
    return gradingResult;
  }

  const gr = gradingResult as Record<string, unknown>;
  let mutated = false;
  const next: Record<string, unknown> = { ...gr };

  if (gr.metadata !== undefined) {
    const redacted = redactHttpHeadersOnMetadata(gr.metadata);
    if (redacted !== gr.metadata) {
      next.metadata = redacted;
      mutated = true;
    }
  }

  if (Array.isArray(gr.componentResults)) {
    let componentMutated = false;
    const nextComponents = gr.componentResults.map((component) => {
      const redacted = redactHttpHeadersOnGradingResult(component);
      if (redacted !== component) {
        componentMutated = true;
      }
      return redacted;
    });
    if (componentMutated) {
      next.componentResults = nextComponents;
      mutated = true;
    }
  }

  return (mutated ? next : gradingResult) as T;
}

function sanitizeResponseForShare<T extends ProviderResponse | null | undefined>(response: T): T {
  if (!response) {
    return response;
  }

  const redactedMetadata = redactHttpHeadersOnMetadata((response as ProviderResponse).metadata, {
    redactLegacyHeaders: true,
  });
  if (redactedMetadata === (response as ProviderResponse).metadata) {
    return response;
  }
  return { ...response, metadata: redactedMetadata } as T;
}

// `responseMetadata` is the (pre-redaction) provider response metadata, used as the provenance
// source so a legacy top-level `metadata.headers` is redacted only where it echoes the
// transport — leaving user-authored test metadata headers intact.
function sanitizeMetadataForShare<T>(metadata: T, responseMetadata?: unknown): T {
  return redactHttpHeadersOnMetadata(metadata, {
    legacyHeadersSource: serializeEvalValue(responseMetadata),
  });
}

function sanitizeGradingResultAssertions<T>(gradingResult: T): T {
  if (!gradingResult || typeof gradingResult !== 'object' || Array.isArray(gradingResult)) {
    return gradingResult;
  }

  const gr = gradingResult as Record<string, unknown>;
  const assertion = asRecord(gr.assertion);
  const sanitizedAssertion = assertion && { ...assertion };
  if (sanitizedAssertion) {
    for (const field of ['provider', 'config']) {
      if (Object.prototype.hasOwnProperty.call(sanitizedAssertion, field)) {
        sanitizedAssertion[field] = sanitizeObject(sanitizedAssertion[field], {
          context: 'grading assertion',
          maxDepth: Number.POSITIVE_INFINITY,
          sanitizeUrls: true,
          throwOnError: true,
        });
      }
    }
  }
  return {
    ...gr,
    ...(sanitizedAssertion && { assertion: sanitizedAssertion }),
    ...(Array.isArray(gr.componentResults) && {
      componentResults: gr.componentResults.map(sanitizeGradingResultAssertions),
    }),
  } as T;
}

function sanitizeGradingResultForShare<T>(gradingResult: T): T {
  return redactHttpHeadersOnGradingResult(sanitizeGradingResultAssertions(gradingResult));
}

function redactSensitiveResultFieldsForShare<
  R extends ProviderResponse | null | undefined,
  G,
  M,
>(fields: {
  response: R;
  gradingResult: G;
  metadata: M;
}): {
  response: R;
  gradingResult: G;
  metadata: M;
} {
  return {
    response: sanitizeResponseForShare(fields.response),
    gradingResult: sanitizeGradingResultForShare(fields.gradingResult),
    // Pass the response metadata as the legacy-header provenance source (see
    // sanitizeMetadataForShare). fields.response is the raw input, so its headers are still
    // cleartext here and can be matched against an echoed result-level metadata.headers.
    metadata: sanitizeMetadataForShare(
      fields.metadata,
      (fields.response as ProviderResponse | null | undefined)?.metadata,
    ),
  };
}

/** Prepare a detached upload copy. Local persistence never calls this redactor. */
export function sanitizeResultForShare<T extends object>(
  result: T,
  stripFlags = getStripFlags(),
): T {
  const row = serializeResultForJsonlArtifact(result, stripFlags) as T & Record<string, unknown>;
  const fields = redactSensitiveResultFieldsForShare({
    response: row.response as ProviderResponse | null | undefined,
    gradingResult: row.gradingResult,
    metadata: row.metadata,
  });
  const shared = { ...row, ...fields };
  for (const field of ['testCase', 'prompt', 'vars', 'provider'] as const) {
    if (Object.prototype.hasOwnProperty.call(row, field)) {
      Object.assign(shared, {
        [field]: sanitizeObject(row[field], {
          context: 'shared eval result',
          maxDepth: Number.POSITIVE_INFINITY,
          sanitizeUrls: true,
          throwOnError: true,
        }),
      });
    }
  }
  return shared;
}
