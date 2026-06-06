import { isDeepStrictEqual } from 'node:util';

import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EvaluateResult,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
} from '../types/index';
import { isApiProvider, isProviderOptions } from '../types/providers';
import { safeJsonStringify } from '../util/json';
import { isSecretField, REDACTED, sanitizeObject } from '../util/sanitizer';
import { getCurrentTimestamp } from '../util/time';
import {
  accumulateGradingRequest,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
} from '../util/tokenUsageUtils';
import { invalidateEvaluationCache } from './evalMutation';
import { clearCountCache } from './evalPerformance';

import type { ProviderConfig } from '../providers/shared';

function sanitizeProviderConfig(config: ProviderConfig): ProviderConfig {
  try {
    let configToSanitize: ProviderConfig = config;
    const serialized = safeJsonStringify(config);
    if (serialized !== undefined) {
      configToSanitize = JSON.parse(serialized);
    }

    return sanitizeObject(configToSanitize, {
      context: 'provider config',
      maxDepth: Number.POSITIVE_INFINITY,
      throwOnError: true,
    }) as ProviderConfig;
  } catch {
    logger.debug('Unable to sanitize provider config safely; omitting config fields');
    return {};
  }
}

function projectProviderResponse(
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

function projectPrompt(prompt: Prompt, stripPromptText: boolean): Prompt {
  return stripPromptText
    ? {
        ...prompt,
        raw: '[prompt stripped]',
      }
    : prompt;
}

function projectTestCase(
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

// Removes circular references and credentials from the provider object and ensures consistent format.
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
): ProviderOptions {
  if (typeof provider === 'string') {
    return { id: provider };
  }

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
  } catch {
    logger.debug('Unable to sanitize provider safely; omitting provider fields');
  }

  return { id: 'unknown' };
}

/**
 * Sanitize an object for database storage by removing circular references
 * and non-serializable values (functions, Timeout objects, etc.).
 * Uses safeJsonStringify which handles circular references gracefully.
 *
 * This prevents "Converting circular structure to JSON" errors that can occur
 * when Node.js Timeout objects or other non-serializable data leaks into results.
 * See: https://github.com/promptfoo/promptfoo/issues/7266
 *
 * Fallback behavior: if serialization returns `undefined` (for example, certain
 * non-JSON-serializable values) or parsing throws, this function preserves JSON
 * shape by returning `[]` for array inputs and `null` for non-array inputs.
 */
function sanitizeForDb<T>(obj: T): T {
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
  } catch {
    // If parsing fails, return type-appropriate fallback
    logger.debug('sanitizeForDb: Parse error, using fallback');
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
 *
 * Note: this sanitizer intentionally uses `maxDepth: Number.POSITIVE_INFINITY`.
 * Provider configs in eval results are not depth-bounded in practice (they can
 * contain arbitrarily deep nested objects from resolved runtime provider/client
 * state). A finite depth could stop traversal early and miss secret-bearing
 * fields at deeper levels.
 */
function sanitizeForDbWithSecrets<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  try {
    return sanitizeObject(obj, {
      context: 'evalResult field',
      // Nested provider configs can be deeper than the default maxDepth (4);
      // match the behavior of `sanitizeConfigForOutput` in `src/util/output.ts`.
      maxDepth: Number.POSITIVE_INFINITY,
      throwOnError: true,
    }) as T;
  } catch {
    logger.debug('Unable to sanitize eval result field safely; omitting field contents');
    return (Array.isArray(obj) ? [] : typeof obj === 'object' ? {} : null) as T;
  }
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

function surfaceTraceMetadata(metadata: Record<string, unknown> | null | undefined): {
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
function redactSensitiveResultFieldsForDb<
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
function getStripFlags() {
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

export default class EvalResult {
  static async createFromEvaluateResult(
    evalId: string,
    result: EvaluateResult,
    opts?: { persist: boolean },
  ) {
    const persist = opts?.persist == null ? true : opts.persist;
    const {
      prompt,
      error,
      score,
      latencyMs,
      success,
      provider,
      gradingResult,
      namedScores,
      cost,
      metadata,
      failureReason,
      testCase,
      traceId,
      evaluationId,
    } = result;

    // Persist trace linkage inside a private metadata namespace so it survives
    // EvalResult round-trips without a Drizzle schema migration.
    const persistedMetadata = persistTraceMetadata(metadata, traceId, evaluationId);

    // Normalize provider for storage and extract blobs from responses.
    const preSanitizeTestCase = {
      ...testCase,
      ...(testCase.provider && {
        provider: sanitizeProvider(testCase.provider),
      }),
    };

    const processedResponse = await extractAndStoreBinaryData(result.response, {
      evalId,
      testIdx: result.testIdx,
      promptIdx: result.promptIdx,
    });

    // Sanitize all JSON fields to remove circular references and non-serializable values.
    // `testCase` and `prompt` can contain a resolved runtime provider under
    // `options.provider` or `config.provider` (used for llm-rubric judging); that
    // provider may hold a live SDK client with credentials (Anthropic apiKey, etc.)
    // and circular references — see `sanitizeForDbWithSecrets`. Other fields go
    // through the lighter `sanitizeForDb` which only strips circular refs /
    // non-serializable values.
    const args = {
      id: crypto.randomUUID(),
      evalId,
      testCase: sanitizeForDbWithSecrets(preSanitizeTestCase),
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt: sanitizeForDbWithSecrets(prompt),
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: sanitizeForDb(processedResponse || null),
      gradingResult: sanitizeForDb(gradingResult || null),
      namedScores: sanitizeForDb(namedScores),
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata: sanitizeForDb(persistedMetadata),
      failureReason,
    };
    if (persist) {
      const db = await getDb();

      const redacted = redactSensitiveResultFieldsForDb({
        response: args.response,
        gradingResult: args.gradingResult,
        metadata: args.metadata,
      });
      args.response = redacted.response;
      args.gradingResult = redacted.gradingResult;
      args.metadata = redacted.metadata;
      const dbResult = await db.insert(evalResultsTable).values(args).returning();
      clearCountCache(evalId);
      return new EvalResult({ ...dbResult[0], persisted: true });
    }
    return new EvalResult(args);
  }

  static async createManyFromEvaluateResult(results: EvaluateResult[], evalId: string) {
    const db = await getDb();
    const returnResults: EvalResult[] = [];
    const processedResults: EvaluateResult[] = [];
    for (const result of results) {
      const processedResponse = isBlobStorageEnabled()
        ? await extractAndStoreBinaryData(result.response, {
            evalId,
            testIdx: result.testIdx,
            promptIdx: result.promptIdx,
          })
        : result.response;
      processedResults.push({ ...result, response: processedResponse ?? undefined });
    }

    await db.transaction(async (tx) => {
      for (const result of processedResults) {
        // See `createFromEvaluateResult` for why `testCase` and `prompt` go
        // through the credential-redacting sanitizer while the other fields
        // stay on the lighter `sanitizeForDb`. Trace IDs travel inside metadata
        // via `persistTraceMetadata`; strip the top-level fields so the DB write
        // only carries known-schema columns.
        const { traceId: _traceId, evaluationId: _evaluationId, ...rest } = result;
        const sanitizedResult = {
          ...rest,
          testCase: sanitizeForDbWithSecrets(result.testCase),
          prompt: sanitizeForDbWithSecrets(result.prompt),
          ...redactSensitiveResultFieldsForDb({
            response: sanitizeForDb(result.response),
            gradingResult: sanitizeForDb(result.gradingResult),
            metadata: sanitizeForDb(
              persistTraceMetadata(result.metadata, result.traceId, result.evaluationId),
            ),
          }),
          namedScores: sanitizeForDb(result.namedScores),
          provider: result.provider ? sanitizeProvider(result.provider) : result.provider,
        };
        const dbResult = await tx
          .insert(evalResultsTable)
          .values({ ...sanitizedResult, evalId, id: crypto.randomUUID() })
          .returning()
          .get();
        returnResults.push(new EvalResult({ ...dbResult, persisted: true }));
      }
    });
    clearCountCache(evalId);
    return returnResults;
  }

  static async findById(id: string) {
    const db = await getDb();
    const result = await db.select().from(evalResultsTable).where(eq(evalResultsTable.id, id));
    return result.length > 0 ? new EvalResult({ ...result[0], persisted: true }) : null;
  }

  static async findManyByEvalId(evalId: string, opts?: { testIdx?: number }) {
    const db = await getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          opts?.testIdx == null ? undefined : eq(evalResultsTable.testIdx, opts.testIdx),
        ),
      );
    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  static async findManyByEvalIdAndTestIndices(evalId: string, testIndices: number[]) {
    if (!testIndices.length) {
      return [];
    }

    const db = await getDb();
    const results = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          testIndices.length === 1
            ? eq(evalResultsTable.testIdx, testIndices[0])
            : inArray(evalResultsTable.testIdx, testIndices),
        ),
      );

    return results.map((result) => new EvalResult({ ...result, persisted: true }));
  }

  /**
   * Returns a set of completed (testIdx,promptIdx) pairs for a given eval.
   * Key format: `${testIdx}:${promptIdx}`
   *
   * @param evalId - The evaluation ID to query
   * @param opts.excludeErrors - If true, excludes results with ERROR failureReason (used in retry mode)
   */
  static async getCompletedIndexPairs(
    evalId: string,
    opts?: { excludeErrors?: boolean },
  ): Promise<Set<string>> {
    const db = await getDb();
    const whereClause = opts?.excludeErrors
      ? and(
          eq(evalResultsTable.evalId, evalId),
          // Exclude ERROR results so they can be retried
          // This prevents resume mode from skipping ERROR results during retry
          ne(evalResultsTable.failureReason, ResultFailureReason.ERROR),
        )
      : eq(evalResultsTable.evalId, evalId);

    const rows = await db
      .select({ testIdx: evalResultsTable.testIdx, promptIdx: evalResultsTable.promptIdx })
      .from(evalResultsTable)
      .where(whereClause);
    const ret = new Set<string>();
    for (const r of rows) {
      ret.add(`${r.testIdx}:${r.promptIdx}`);
    }
    return ret;
  }

  // This is a generator that yields batches of results from the database
  // These are batched by test Id, not just results to ensure we get all results for a given test
  static async *findManyByEvalIdBatched(
    evalId: string,
    opts?: {
      batchSize?: number;
    },
  ): AsyncGenerator<EvalResult[]> {
    const db = await getDb();
    const batchSize = opts?.batchSize || 100;
    let offset = 0;

    while (true) {
      const nextResult = await db
        .select({ testIdx: evalResultsTable.testIdx })
        .from(evalResultsTable)
        .where(and(eq(evalResultsTable.evalId, evalId), gte(evalResultsTable.testIdx, offset)))
        .orderBy(evalResultsTable.testIdx)
        .limit(1)
        .get();

      if (!nextResult) {
        break;
      }

      offset = nextResult.testIdx;
      const results = await db
        .select()
        .from(evalResultsTable)
        .where(
          and(
            eq(evalResultsTable.evalId, evalId),
            gte(evalResultsTable.testIdx, offset),
            lt(evalResultsTable.testIdx, offset + batchSize),
          ),
        )
        .all();

      yield results.map((result) => new EvalResult({ ...result, persisted: true }));
      offset += batchSize;
    }
  }

  id: string;
  evalId: string;
  description?: string | null;
  promptIdx: number;
  testIdx: number;
  testCase: AtomicTestCase;
  prompt: Prompt;
  promptId: string;
  error?: string | null;
  success: boolean;
  score: number;
  response: ProviderResponse | undefined;
  gradingResult: GradingResult | null;
  namedScores: Record<string, number>;
  provider: ProviderOptions;
  latencyMs: number;
  cost: number;
  // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
  metadata: Record<string, any>;
  traceId?: string;
  evaluationId?: string;
  failureReason: ResultFailureReason;
  persisted: boolean;
  pluginId?: string;

  constructor(opts: {
    id: string;
    evalId: string;
    promptIdx: number;
    testIdx: number;
    testCase: AtomicTestCase;
    prompt: Prompt;
    promptId?: string | null;
    error?: string | null;
    success: boolean;
    score: number;
    response: ProviderResponse | null;
    gradingResult: GradingResult | null;
    namedScores?: Record<string, number> | null;
    provider: ProviderOptions;
    latencyMs?: number | null;
    cost?: number | null;
    // biome-ignore lint/suspicious/noExplicitAny: I think this can truly be any?
    metadata?: Record<string, any> | null;
    failureReason: ResultFailureReason | number;
    persisted?: boolean;
  }) {
    this.id = opts.id;
    this.evalId = opts.evalId;

    this.promptIdx = opts.promptIdx;
    this.testIdx = opts.testIdx;
    this.testCase = opts.testCase;
    this.prompt = opts.prompt;
    this.promptId = opts.promptId || hashPrompt(opts.prompt);
    this.error = opts.error;
    this.score = opts.score;
    this.success = opts.success;
    this.response = opts.response || undefined;
    this.gradingResult = opts.gradingResult;
    this.namedScores = opts.namedScores || {};
    this.provider = opts.provider;
    this.latencyMs = opts.latencyMs || 0;
    this.cost = opts.cost || 0;
    ({
      metadata: this.metadata,
      traceId: this.traceId,
      evaluationId: this.evaluationId,
    } = surfaceTraceMetadata(opts.metadata));
    this.failureReason = isResultFailureReason(opts.failureReason)
      ? opts.failureReason
      : ResultFailureReason.NONE;
    this.persisted = opts.persisted || false;
    this.pluginId = opts.testCase.metadata?.pluginId;
  }

  async save() {
    const db = await getDb();
    // Trace linkage and `pluginId` aren't schema columns — `pluginId` is re-derived from
    // testCase metadata in the constructor, and trace linkage travels inside the metadata
    // JSON via persistTraceMetadata. Drizzle would drop them silently, but excluding them
    // explicitly keeps the write payload aligned with the schema.
    const { traceId: _traceId, evaluationId: _evaluationId, pluginId: _pluginId, ...rest } = this;
    const persistedValues = {
      ...rest,
      metadata: persistTraceMetadata(this.metadata, this.traceId, this.evaluationId),
    };
    //check if this exists in the db
    if (this.persisted) {
      await db
        .update(evalResultsTable)
        .set({ ...persistedValues, updatedAt: getCurrentTimestamp() })
        .where(eq(evalResultsTable.id, this.id))
        .run();
    } else {
      const result = await db.insert(evalResultsTable).values(persistedValues).returning();
      this.id = result[0].id;
      this.persisted = true;
    }
    invalidateEvaluationCache(this.evalId);
  }

  toEvaluateResult(): EvaluateResult {
    const {
      shouldStripPromptText,
      shouldStripResponseOutput,
      shouldStripTestVars,
      shouldStripGradingResult,
      shouldStripMetadata,
    } = getStripFlags();

    const response = projectProviderResponse(this.response, {
      stripMetadata: shouldStripMetadata,
      stripOutput: shouldStripResponseOutput,
    });

    const prompt = projectPrompt(this.prompt, shouldStripPromptText);

    const testCase = projectTestCase(this.testCase, {
      stripMetadata: shouldStripMetadata,
      stripVars: shouldStripTestVars,
    });
    // Mirror the live accounting in the evaluator: a response counts as one provider
    // request even when it reports no token usage, and a grading result counts as one
    // assertion request (with its tokens folded in when present).
    const tokenUsage = createEmptyTokenUsage();
    if (this.response) {
      accumulateResponseTokenUsage(tokenUsage, this.response);
    }
    if (this.gradingResult) {
      accumulateGradingRequest(tokenUsage.assertions, this.gradingResult.tokensUsed);
    }

    return {
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult ? null : this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...(this.evaluationId ? { evaluationId: this.evaluationId } : {}),
      provider: { id: this.provider.id, label: this.provider.label },
      response,
      score: this.score,
      success: this.success,
      testCase,
      testIdx: this.testIdx,
      tokenUsage,
      vars: shouldStripTestVars ? {} : this.testCase.vars || {},
      metadata: shouldStripMetadata ? {} : this.metadata,
      failureReason: this.failureReason,
    };
  }
}

/** Normalize an `EvalResult` model instance or a plain `EvaluateResult` to `EvaluateResult`. */
export function asEvaluateResult(result: EvalResult | EvaluateResult): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult() : result;
}

/** Canonical `testIdx:promptIdx` key used to dedupe/look up a result across the streaming,
 * recovery, and comparison paths. */
export function getResultIndexKey(result: Pick<EvaluateResult, 'testIdx' | 'promptIdx'>): string {
  return `${result.testIdx}:${result.promptIdx}`;
}
