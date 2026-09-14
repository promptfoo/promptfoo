import { isDeepStrictEqual } from 'node:util';

import { getEnvBool } from '../envars';
import logger from '../logger';
import { isApiProvider, isProviderOptions } from '../types/providers';
import { safeJsonStringify } from '../util/json';
import { isSecretField, REDACTED, sanitizeObject } from '../util/sanitizer';

import type { ProviderConfig } from '../providers/shared';
import type {
  ApiProvider,
  AtomicTestCase,
  EvaluateResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

function sanitizeProviderConfig(config: ProviderConfig): ProviderConfig {
  return sanitizeObject(JSON.parse(safeJsonStringify(config) as string), {
    context: 'provider config',
    maxDepth: Number.POSITIVE_INFINITY,
  }) as ProviderConfig;
}

export function projectProviderResponse(
  response: ProviderResponse | undefined,
  options: { stripMetadata: boolean; stripOutput: boolean },
): ProviderResponse | undefined {
  if (!response) {
    return response;
  }

  if (!options.stripMetadata && !options.stripOutput) {
    return response;
  }

  const projectedResponse = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(response)
    : { ...response };

  if (options.stripOutput) {
    projectedResponse.output = '[output stripped]';
  }

  return projectedResponse;
}

export function projectPrompt(prompt: Prompt, stripPromptText: boolean): Prompt {
  return stripPromptText
    ? {
        ...prompt,
        raw: '[prompt stripped]',
      }
    : prompt;
}

export function projectTestCase(
  testCase: AtomicTestCase,
  options: { stripMetadata: boolean; stripVars: boolean },
): AtomicTestCase {
  if (!options.stripMetadata && !options.stripVars) {
    return testCase;
  }

  const projectedTestCase = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(testCase)
    : { ...testCase };

  if (options.stripVars) {
    projectedTestCase.vars = undefined;
  }

  return projectedTestCase;
}

// Removes circular references from the provider object and ensures consistent format
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
): ProviderOptions {
  try {
    if (isApiProvider(provider)) {
      return {
        id: provider.id(),
        label: provider.label,
        ...(provider.config && {
          config: sanitizeProviderConfig(provider.config),
        }),
      };
    }
    if (isProviderOptions(provider)) {
      return {
        id: provider.id,
        label: provider.label,
        ...(provider.config && {
          config: sanitizeProviderConfig(provider.config),
        }),
      };
    }
    if (typeof provider === 'object' && provider) {
      const providerObj = provider as {
        id: string | (() => string);
        label?: string;
        config?: ProviderConfig;
      };
      return {
        id: typeof providerObj.id === 'function' ? providerObj.id() : providerObj.id,
        label: providerObj.label,
        ...(providerObj.config && {
          config: sanitizeProviderConfig(providerObj.config),
        }),
      };
    }
  } catch {}
  return JSON.parse(safeJsonStringify(provider) as string);
}

/**
 * Sanitize an object for database storage by removing circular references
 * and non-serializable values (functions, Timeout objects, etc.).
 * Uses safeJsonStringify which handles circular references gracefully.
 *
 * This prevents "Converting circular structure to JSON" errors that can occur
 * when Node.js Timeout objects or other non-serializable data leaks into results.
 * See: https://github.com/promptfoo/promptfoo/issues/7266
 */
export function sanitizeForDb<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  try {
    const serialized = safeJsonStringify(obj);
    if (serialized === undefined) {
      // safeJsonStringify returns undefined for non-serializable objects (e.g., BigInt)
      // This is a rare edge case - log for debugging and return type-appropriate fallback
      logger.debug('sanitizeForDb: Failed to serialize object, using fallback', {
        valueType: typeof obj,
        isArray: Array.isArray(obj),
      });
      // Preserve JSON shape: arrays return [], objects/primitives return null
      return (Array.isArray(obj) ? [] : null) as T;
    }
    return JSON.parse(serialized);
  } catch (error) {
    // If parsing fails, return type-appropriate fallback
    logger.debug('sanitizeForDb: Parse error, using fallback', { error });
    return (Array.isArray(obj) ? [] : null) as T;
  }
}

/**
 * Sanitize a per-test-case field for persistence: strips circular refs,
 * collapses class instances (e.g. live SDK clients that leaked in via
 * `defaultTest.options.provider`), and redacts credential fields (`apiKey`,
 * `token`, etc.) at any depth. Use this for any slot that can carry a provider
 * config — notably `testCase.options.provider` and `prompt.config.provider`,
 * where the resolved runtime provider (with its Anthropic / Bedrock SDK
 * client) flows in from the evaluator. Without this, credentials configured on
 * the judge provider end up in the Eval results both in the DB and in the
 * polling response served by `/api/eval/job/:id`.
 */
export function sanitizeForDbWithSecrets<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  return sanitizeObject(obj, {
    context: 'evalResult field',
    // Nested provider configs can be deeper than the default maxDepth (4);
    // match the behavior of `sanitizeConfigForOutput` in `src/util/output.ts`.
    maxDepth: Number.POSITIVE_INFINITY,
  }) as T;
}

// Headers that may carry credentials, session state, or PII / org-level identifiers
// when echoed back from OpenAI / edge proxies. We redact these on the persistence
// and JSONL artifact boundaries only — keep them in-memory so callers / hooks
// still see real values.
//
// Note: `sanitizeForDbWithSecrets` already redacts well-known credential-shaped keys
// (`set-cookie`, `cookie`, `authorization`, …) via `SECRET_FIELD_NAMES`, and
// `looksLikeSecret` redacts values that match common API-key shapes. This list adds
// the headers those passes don't catch (project/org IDs, request IDs, ratelimit hints,
// trace IDs, edge-proxy markers).
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

function sanitizeResponseForDb<T extends ProviderResponse | null | undefined>(response: T): T {
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
function sanitizeMetadataForDb<T>(metadata: T, responseMetadata?: unknown): T {
  return redactHttpHeadersOnMetadata(metadata, {
    legacyHeadersSource: sanitizeForDb(responseMetadata),
  });
}

function sanitizeGradingResultForDb<T>(gradingResult: T): T {
  return redactHttpHeadersOnGradingResult(gradingResult);
}

// `__promptfoo` is reserved at the metadata top level for promptfoo-internal namespaced data
// (currently `traceLinkage`). User-supplied non-object values under this key are overwritten —
// log so the rare collision is visible. Mirrored in `EvalQueries.getMetadataKeysFromEval` /
// `getMetadataValuesFromEval`, which hide the namespace from the metadata-discovery API.
export const PROMPTFOO_METADATA_KEY = '__promptfoo';
const TRACE_LINKAGE_KEY = 'traceLinkage';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function persistTraceMetadata(
  metadata: EvaluateResult['metadata'],
  traceId: EvaluateResult['traceId'],
  evaluationId: EvaluateResult['evaluationId'],
): EvaluateResult['metadata'] {
  if (!traceId && !evaluationId) {
    return stripTraceLinkageFromMetadata(metadata);
  }

  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  if (metadataRecord[PROMPTFOO_METADATA_KEY] !== undefined && promptfooMetadata === undefined) {
    logger.warn(
      `[EvalResult] Overwriting non-object metadata.${PROMPTFOO_METADATA_KEY} with internal trace linkage; the key is reserved for promptfoo internals.`,
    );
  }
  if (promptfooMetadata && TRACE_LINKAGE_KEY in promptfooMetadata) {
    logger.warn(
      `[EvalResult] Overwriting metadata.${PROMPTFOO_METADATA_KEY}.${TRACE_LINKAGE_KEY} with internal trace linkage; the path is reserved for promptfoo internals.`,
    );
  }

  // `traceId`/`evaluationId` are only persisted when truthy — JSON.stringify strips
  // undefined values, and `surfaceTraceMetadata` requires `typeof === 'string'` on read.
  return {
    ...metadataRecord,
    [PROMPTFOO_METADATA_KEY]: {
      ...(promptfooMetadata ?? {}),
      [TRACE_LINKAGE_KEY]: { traceId, evaluationId },
    },
  };
}

export function stripTraceLinkageFromMetadata<T extends Record<string, unknown> | null | undefined>(
  metadata: T,
): T {
  const metadataRecord = asRecord(metadata);
  const promptfooMetadata = asRecord(metadataRecord?.[PROMPTFOO_METADATA_KEY]);
  if (!metadataRecord || !promptfooMetadata || !(TRACE_LINKAGE_KEY in promptfooMetadata)) {
    return metadata;
  }

  const { [TRACE_LINKAGE_KEY]: _traceLinkage, ...remainingPromptfooMetadata } = promptfooMetadata;
  const strippedMetadata = { ...metadataRecord };
  delete strippedMetadata[PROMPTFOO_METADATA_KEY];
  if (Object.keys(remainingPromptfooMetadata).length > 0) {
    strippedMetadata[PROMPTFOO_METADATA_KEY] = remainingPromptfooMetadata;
  }

  return strippedMetadata as T;
}

export function surfaceTraceMetadata(metadata: Record<string, unknown> | null | undefined): {
  traceId?: string;
  evaluationId?: string;
  metadata: Record<string, unknown>;
} {
  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  const traceLinkage = asRecord(promptfooMetadata?.[TRACE_LINKAGE_KEY]);

  const traceId = typeof traceLinkage?.traceId === 'string' ? traceLinkage.traceId : undefined;
  const evaluationId =
    typeof traceLinkage?.evaluationId === 'string' ? traceLinkage.evaluationId : undefined;

  // Strip the reserved namespace whenever a `traceLinkage` entry exists — even if the
  // stored ids are malformed (non-string), the internal namespace must never surface to
  // users. Gate on presence of the key, not on whether the ids read back as valid strings.
  const hasTraceLinkage = promptfooMetadata != null && TRACE_LINKAGE_KEY in promptfooMetadata;
  if (!hasTraceLinkage) {
    return { traceId, evaluationId, metadata: metadataRecord };
  }

  return {
    traceId,
    evaluationId,
    metadata: stripTraceLinkageFromMetadata(metadataRecord),
  };
}

// Apply the credential-header redaction trio to the already-`sanitizeForDb`'d fields bound for
// the database or a JSONL artifact. Single source of truth for which redactor pairs with which
// field, shared by DB persistence (`createFromEvaluateResult` / `createManyFromEvaluateResult`)
// and the JSONL artifact boundary (`sanitizeResultForJsonlArtifact`) so a newly added sensitive
// field can't be redacted on one path while leaking from another.
export function redactSensitiveResultFieldsForDb<
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
    response: sanitizeResponseForDb(fields.response),
    gradingResult: sanitizeGradingResultForDb(fields.gradingResult),
    // Pass the response metadata as the legacy-header provenance source (see
    // sanitizeMetadataForDb). fields.response is the raw input, so its headers are still
    // cleartext here and can be matched against an echoed result-level metadata.headers.
    metadata: sanitizeMetadataForDb(
      fields.metadata,
      (fields.response as ProviderResponse | null | undefined)?.metadata,
    ),
  };
}

// Read the `PROMPTFOO_STRIP_*` output-projection flags. Shared by the JSONL-artifact
// sanitizer and the EvalResult -> EvaluateResult projection so both honor the same env.
export function getStripFlags() {
  return {
    shouldStripPromptText: getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false),
    shouldStripResponseOutput: getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false),
    shouldStripTestVars: getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false),
    shouldStripGradingResult: getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false),
    shouldStripMetadata: getEnvBool('PROMPTFOO_STRIP_METADATA', false),
  };
}

/**
 * Sanitize a result before it is serialized into a JSONL output artifact. This is the
 * JSONL-boundary equivalent of the database-persistence sanitization and must stay in sync
 * with it: it redacts credential-bearing HTTP headers from the response / grading / metadata
 * and applies the `PROMPTFOO_STRIP_*` projections (prompt text, response output, test vars,
 * grading result, metadata). In-memory rows keep their real values for hooks; only the
 * on-disk copy is sanitized.
 */
export function sanitizeResultForJsonlArtifact<T extends object>(result: T): T {
  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  } = getStripFlags();

  const artifactResult = result as T & Record<string, unknown>;
  const redacted = redactSensitiveResultFieldsForDb({
    response: sanitizeForDb(artifactResult.response as ProviderResponse | null | undefined),
    gradingResult: sanitizeForDb(artifactResult.gradingResult),
    metadata: sanitizeForDb(artifactResult.metadata),
  });
  const response = projectProviderResponse(redacted.response ?? undefined, {
    stripMetadata: shouldStripMetadata,
    stripOutput: shouldStripResponseOutput,
  });

  return {
    ...result,
    ...(artifactResult.testCase
      ? {
          testCase: projectTestCase(
            sanitizeForDbWithSecrets(artifactResult.testCase as AtomicTestCase),
            {
              stripMetadata: shouldStripMetadata,
              stripVars: shouldStripTestVars,
            },
          ),
        }
      : {}),
    ...(artifactResult.vars === undefined
      ? {}
      : {
          vars: shouldStripTestVars ? {} : sanitizeForDbWithSecrets(artifactResult.vars),
        }),
    ...(artifactResult.prompt
      ? {
          prompt: projectPrompt(
            sanitizeForDbWithSecrets(artifactResult.prompt as Prompt),
            shouldStripPromptText,
          ),
        }
      : {}),
    ...(artifactResult.provider
      ? {
          provider: sanitizeProvider(
            artifactResult.provider as ApiProvider | ProviderOptions | string,
          ),
        }
      : {}),
    response,
    gradingResult: shouldStripGradingResult ? null : redacted.gradingResult,
    namedScores: sanitizeForDb(artifactResult.namedScores),
    metadata: shouldStripMetadata ? {} : redacted.metadata,
  } as T;
}
