import { isDeepStrictEqual } from 'node:util';

import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import { extractAndStoreResultMedia, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable, evalsTable } from '../database/tables';
import { type EnvVarKey, getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import { ProviderConfig } from '../providers/shared';
import { PromptfooAttributes } from '../tracing/genaiTracer';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EnvOverrides,
  type EvaluateResult,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
  type TraceData,
} from '../types/index';
import { isApiProvider, isProviderOptions } from '../types/providers';
import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from '../util/gradingProvider';
import { safeJsonStringify } from '../util/json';
import {
  isSecretField,
  mapTestProviderRefs,
  REDACTED,
  sanitizeObject,
  stripProviderPromptSelectors,
  stripTestProviderPromptSelectors,
} from '../util/sanitizer';
import { getCurrentTimestamp } from '../util/time';
import {
  accumulateGradingTokenUsage,
  accumulateResponseTokenUsage,
  createEmptyTokenUsage,
  getErrorTokenUsage,
} from '../util/tokenUsageUtils';
import { invalidateEvaluationCache } from './evalMutation';
import { clearCountCache } from './evalPerformance';

function sanitizeProviderConfig(config: ProviderConfig): ProviderConfig {
  return sanitizeObject(JSON.parse(safeJsonStringify(config) as string), {
    context: 'provider config',
    sanitizeUrls: true,
    maxDepth: Number.POSITIVE_INFINITY,
  }) as ProviderConfig;
}

function stripMediaReferences(value: unknown): unknown {
  if (
    extractBlobHashesFromValue(value).length > 0 ||
    (typeof value === 'string' && /^data:[^,]*,/i.test(value))
  ) {
    return '[output stripped]';
  }
  if (Array.isArray(value)) {
    return value.map(stripMediaReferences);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, stripMediaReferences(item)]),
    );
  }
  return value;
}

function projectOutputMetadata<T>(
  metadata: T,
  options: ResponseProjectionOptions,
  responseMetadata: ProviderResponse['metadata'],
  testMetadata?: AtomicTestCase['metadata'],
): T {
  if (options.checkpointOutput && options.stripOutput && !asRecord(metadata)) {
    return stripMediaReferences(sanitizeForDb(metadata)) as T;
  }
  const metadataIsMedia =
    options.checkpointOutput &&
    options.stripOutput &&
    extractBlobHashesFromValue(metadata).length > 0;
  let projected = metadata;
  if (metadataIsMedia) {
    // A media record can carry bytes under arbitrary payload keys. Keep only
    // an explicitly owned checkpoint wrapper for independent input projection.
    const record = asRecord(metadata)!;
    projected = (
      record.interruptedStrategy === true
        ? {
            interruptedStrategy: true,
            completedTargetResponses: record.completedTargetResponses,
          }
        : stripMediaReferences(sanitizeForDb(metadata))
    ) as T;
  } else if (options.stripOutput && metadata && responseMetadata && typeof metadata === 'object') {
    projected = Object.fromEntries(
      Object.entries(metadata).flatMap(([key, value]) => {
        if (
          !Object.prototype.hasOwnProperty.call(responseMetadata, key) ||
          (testMetadata && isDeepStrictEqual(value, testMetadata[key])) ||
          // Checkpoints contain target inputs as well as outputs; project their
          // response fields below instead of stripping input media references.
          (key === 'completedTargetResponses' && asRecord(metadata)?.interruptedStrategy === true)
        ) {
          return [[key, value]];
        }
        return key === 'audio' || key === 'blobUris'
          ? []
          : [[key, stripMediaReferences(sanitizeForDb(value))]];
      }),
    ) as T;
  }
  return mapCompletedTargetResponses(
    sanitizeCompletedTargetResponses(projected),
    (entry) => ({
      ...entry,
      ...('prompt' in entry && options.stripPromptText ? { prompt: '[prompt stripped]' } : {}),
      // Old stored rows and non-persisted JSON/JSONL exports also cross this boundary.
      response: projectProviderResponse(entry.response, { ...options, checkpointOutput: true })!,
    }),
    options.stripOutput ? (value) => stripMediaReferences(sanitizeForDb(value)) : undefined,
  );
}

interface ResponseProjectionOptions {
  stripMetadata: boolean;
  stripOutput: boolean;
  stripPromptText: boolean;
  checkpointOutput?: boolean;
}

const CHECKPOINT_INPUT_FIELDS = new Set([
  'prompt',
  'input',
  'materializedVars',
  'inputMaterialization',
]);

// Numeric/boolean ProviderResponse controls have an unambiguous non-output role
// on a media record. Validate them independently so malformed payload aliases
// cannot hide in them. Ordinary non-media responses keep their diagnostics.
const CHECKPOINT_CONTROL_SCHEMAS = {
  cached: z.boolean(),
  cost: z.number(),
  incurredCost: z.number(),
  materializationHandled: z.boolean(),
  isBase64: z.boolean(),
  logProbs: z.array(z.number()),
  latencyMs: z.number(),
  isRefusal: z.boolean(),
  conversationEnded: z.boolean(),
  guardrails: z.object({
    flaggedInput: z.boolean().optional(),
    flaggedOutput: z.boolean().optional(),
    flagged: z.boolean().optional(),
  }),
};

function projectProviderResponse(
  response: ProviderResponse | undefined,
  options: ResponseProjectionOptions,
): ProviderResponse | undefined {
  if (!response) {
    return response;
  }

  if (
    !options.stripMetadata &&
    !options.stripOutput &&
    !options.stripPromptText &&
    response.metadata?.interruptedStrategy !== true
  ) {
    return response;
  }

  let projectedResponse: ProviderResponse & { turns?: unknown } = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(response)
    : { ...response };

  if (options.stripOutput) {
    projectedResponse.output = '[output stripped]';
    delete projectedResponse.raw;
    delete projectedResponse.providerTransformedOutput;
    delete projectedResponse.audio;
    delete projectedResponse.video;
    delete projectedResponse.images;
  }
  if (options.stripPromptText && 'prompt' in projectedResponse) {
    projectedResponse.prompt = '[prompt stripped]';
  }
  if (options.checkpointOutput && options.stripOutput) {
    if (extractBlobHashesFromValue(projectedResponse).length > 0) {
      // Direct media records may contain unknown inline payload aliases. Retain
      // only declared inputs, controls, and independently projected children.
      const tokenUsage = getErrorTokenUsage(projectedResponse);
      projectedResponse = {
        ...Object.fromEntries(
          Object.entries(projectedResponse).filter(
            ([key]) => CHECKPOINT_INPUT_FIELDS.has(key) || key === 'metadata' || key === 'turns',
          ),
        ),
        ...Object.fromEntries(
          Object.entries(CHECKPOINT_CONTROL_SCHEMAS).flatMap(([key, schema]) => {
            const parsed = schema.safeParse(projectedResponse[key as keyof ProviderResponse]);
            return parsed.success ? [[key, parsed.data]] : [];
          }),
        ),
        ...(tokenUsage && { tokenUsage }),
        output: '[output stripped]',
      };
    }
    for (const [key, value] of Object.entries(projectedResponse)) {
      // Inputs and recursively projected metadata/turns retain their own
      // controls, even when the response also carries a direct BlobRef.
      if (CHECKPOINT_INPUT_FIELDS.has(key) || key === 'metadata' || key === 'turns') {
        continue;
      }
      Object.defineProperty(projectedResponse, key, {
        value: stripMediaReferences(sanitizeForDb(value)),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  if (projectedResponse.metadata) {
    projectedResponse.metadata = projectOutputMetadata(
      projectedResponse.metadata,
      options,
      projectedResponse.metadata,
    );
  }

  // Legacy multi-turn target responses carry the same prompt/output/media fields
  // per turn. Project those fields without touching unrelated turn attributes.
  if (Array.isArray(projectedResponse.turns)) {
    projectedResponse.turns = projectedResponse.turns.map((turn) => {
      const record = asRecord(turn);
      return record
        ? projectProviderResponse(record, options)
        : options.stripOutput
          ? stripMediaReferences(sanitizeForDb(turn))
          : turn;
    });
  } else if (options.stripOutput && projectedResponse.turns !== undefined) {
    projectedResponse.turns = stripMediaReferences(sanitizeForDb(projectedResponse.turns));
  }

  return projectedResponse;
}

export function projectPrompt<T extends Prompt>(prompt: T, stripPromptText: boolean): T {
  return stripPromptText
    ? {
        ...prompt,
        raw: '[prompt stripped]',
        template: undefined,
        ...(prompt.config?.provider && {
          config: {
            ...prompt.config,
            provider: stripProviderPromptSelectors(prompt.config.provider),
          },
        }),
      }
    : prompt;
}

export function projectTracesForOutput(
  traces: TraceData[],
  {
    shouldStripMetadata,
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
  }: ReturnType<typeof getStripFlags>,
) {
  if (
    !shouldStripMetadata &&
    !shouldStripPromptText &&
    !shouldStripResponseOutput &&
    !shouldStripTestVars
  ) {
    return traces;
  }

  return traces.map((trace) => {
    let projectedTrace = trace;
    if (shouldStripMetadata) {
      const { metadata: _metadata, ...traceWithoutMetadata } = trace;
      projectedTrace = traceWithoutMetadata;
    } else if (shouldStripTestVars && trace.metadata && 'vars' in trace.metadata) {
      const { metadata: traceMetadata, ...traceWithoutMetadata } = trace;
      const { vars: _vars, ...metadata } = traceMetadata;
      projectedTrace = {
        ...traceWithoutMetadata,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };
    }

    if (!shouldStripPromptText && !shouldStripResponseOutput) {
      return projectedTrace;
    }

    return {
      ...projectedTrace,
      spans: projectedTrace.spans.map((span) => {
        if (!span.attributes) {
          return span;
        }

        const projectedAttributes = { ...span.attributes };
        if (shouldStripPromptText) {
          delete projectedAttributes[PromptfooAttributes.REQUEST_BODY];
        }
        if (shouldStripResponseOutput) {
          delete projectedAttributes[PromptfooAttributes.RESPONSE_BODY];
        }

        const { attributes: _attributes, ...projectedSpan } = span;
        return {
          ...projectedSpan,
          ...(Object.keys(projectedAttributes).length > 0 && {
            attributes: projectedAttributes,
          }),
        };
      }),
    };
  });
}

function projectTestCase(
  testCase: AtomicTestCase,
  options: {
    stripMetadata: boolean;
    stripVars: boolean;
    stripOutput: boolean;
    stripPromptText: boolean;
  },
): AtomicTestCase {
  if (
    !options.stripMetadata &&
    !options.stripVars &&
    !options.stripOutput &&
    !options.stripPromptText
  ) {
    return testCase;
  }

  const projectedTestCase: AtomicTestCase = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(testCase)
    : { ...testCase };

  if (options.stripVars) {
    projectedTestCase.vars = undefined;
  }
  if (options.stripOutput) {
    delete projectedTestCase.providerOutput;
  }
  if (options.stripMetadata && testCase.metadata?.__promptfoo?.remote === true) {
    projectedTestCase.metadata = { __promptfoo: { remote: true } };
  }

  return options.stripPromptText
    ? stripTestProviderPromptSelectors(projectedTestCase)
    : projectedTestCase;
}

/** Map only grading assertion providers and component results. */
function mapGradingResultProviderRefs<T>(
  gradingResult: T,
  mapProvider: (provider: unknown) => unknown,
): T {
  const visited = new WeakMap<object, Record<string, unknown>>();
  const project = (value: unknown): unknown => {
    const result = asRecord(value);
    if (!result) {
      return value;
    }
    const previous = visited.get(result);
    if (previous) {
      return previous;
    }
    const projected = { ...result };
    visited.set(result, projected);
    if (result.assertion) {
      projected.assertion = mapTestProviderRefs(result.assertion, mapProvider);
    }
    if (Array.isArray(result.componentResults)) {
      projected.componentResults = result.componentResults.map(project);
    }
    return projected;
  };
  return project(gradingResult) as T;
}

/** Project assertion providers only, preserving grading details and unrelated metadata. */
function projectGradingResult<T>(gradingResult: T, stripPromptText: boolean): T {
  return stripPromptText
    ? mapGradingResultProviderRefs(gradingResult, stripProviderPromptSelectors)
    : gradingResult;
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

/** Snapshot live provider references for replay without retaining runtime client state. */
export function toSerializableProviderRef(provider: unknown): unknown {
  if (isApiProvider(provider)) {
    return {
      ...sanitizeProvider(provider),
      ...sanitizeObject(
        {
          transform: typeof provider.transform === 'string' ? provider.transform : undefined,
          delay: provider.delay,
          inputs: provider.inputs,
        },
        { context: 'provider options', sanitizeUrls: true, maxDepth: Number.POSITIVE_INFINITY },
      ),
      ...(provider.prompts && { prompts: [...provider.prompts] }),
    };
  }
  if (Array.isArray(provider)) {
    return provider.map(toSerializableProviderRef);
  }
  if (isProviderTypeMap(provider)) {
    let serialized: Record<string, unknown> | undefined;
    for (const type of GRADING_PROVIDER_TYPE_KEYS) {
      if (isApiProvider(provider[type])) {
        serialized ??= { ...provider };
        serialized[type] = toSerializableProviderRef(provider[type]);
      }
    }
    return serialized ?? provider;
  }
  return provider;
}

/** Snapshot live grading references before generic result serialization invokes provider toJSON. */
function serializeResultProviderRefs<T extends object>(result: T): T {
  const record = result as Record<string, unknown>;
  const serializeProvider = (provider: unknown) => {
    if (!isApiProvider(provider) && !isProviderTypeMap(provider)) {
      return provider;
    }
    return sanitizeObject(toSerializableProviderRef(provider), {
      context: 'grading provider',
      sanitizeUrls: true,
      maxDepth: Number.POSITIVE_INFINITY,
      throwOnError: true,
    });
  };
  const projected: Record<string, unknown> = { ...record };
  if (record.testCase) {
    projected.testCase = mapTestProviderRefs(record.testCase, serializeProvider);
  }
  const prompt = asRecord(record.prompt);
  const config = asRecord(prompt?.config);
  if (config?.provider !== undefined) {
    projected.prompt = {
      ...prompt,
      config: { ...config, provider: serializeProvider(config.provider) },
    };
  }
  if (record.gradingResult) {
    projected.gradingResult = mapGradingResultProviderRefs(record.gradingResult, serializeProvider);
  }
  return projected as T;
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
  } catch (error) {
    // If parsing fails, return type-appropriate fallback
    logger.debug('sanitizeForDb: Parse error, using fallback', { error });
    return (Array.isArray(obj) ? [] : null) as T;
  }
}

/**
 * Detach JSON-compatible fields without joining their binary strings into one
 * JSON string. Native traversal preserves toJSON and circular/undefined behavior;
 * string values are restored by path so user data cannot collide with a sentinel.
 */
function snapshotForMediaExtraction<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  const ancestors: object[] = [];
  const paths: string[][] = [];
  const strings: Array<{ path: string[]; value: string }> = [];
  try {
    const serialized = JSON.stringify(obj, function (key, value: unknown) {
      while (ancestors.length && ancestors[ancestors.length - 1] !== this) {
        ancestors.pop();
        paths.pop();
      }
      const path = ancestors.length ? [...paths[paths.length - 1], key] : [];
      if (typeof value === 'string') {
        strings.push({ path, value });
        return '';
      }
      if (value && typeof value === 'object') {
        if (ancestors.includes(value)) {
          return undefined;
        }
        ancestors.push(value);
        paths.push(path);
      }
      return value;
    });
    if (serialized === undefined) {
      return (Array.isArray(obj) ? [] : null) as T;
    }
    let snapshot: unknown = JSON.parse(serialized);
    for (const entry of strings) {
      if (entry.path.length === 0) {
        snapshot = entry.value;
        continue;
      }
      let holder = snapshot as Record<string, unknown>;
      for (const key of entry.path.slice(0, -1)) {
        holder = holder[key] as Record<string, unknown>;
      }
      Object.defineProperty(holder, entry.path[entry.path.length - 1], {
        value: entry.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return snapshot as T;
  } catch (error) {
    // Never silently truncate payloads if even their string-free structure is
    // too large. Other non-serializable SDK values keep the existing fallback.
    if (error instanceof RangeError && error.message.includes('Invalid string length')) {
      throw error;
    }
    logger.debug('snapshotForMediaExtraction: Failed to serialize object, using fallback', {
      valueType: typeof obj,
      isArray: Array.isArray(obj),
    });
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
function sanitizeForDbWithSecrets<T>(obj: T): T {
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
  if (!response || !asRecord(response)) {
    return response;
  }

  const redactedMetadata = sanitizeCompletedTargetResponses(
    redactHttpHeadersOnMetadata((response as ProviderResponse).metadata, {
      redactLegacyHeaders: true,
    }),
  );
  const redactedPrompt = sanitizeForDbWithSecrets(response.prompt);
  const redacted = {
    ...response,
    metadata: redactedMetadata,
    ...('prompt' in response ? { prompt: redactedPrompt } : {}),
  };
  const turns = asRecord(response)?.turns;
  if (Array.isArray(turns)) {
    const redactedTurns = turns.map((turn) => {
      const record = asRecord(turn);
      return record ? sanitizeResponseForDb(record) : turn;
    });
    if (redactedTurns.some((turn, index) => turn !== turns[index])) {
      return { ...redacted, turns: redactedTurns } as T;
    }
  }
  if (redactedMetadata === response.metadata && redactedPrompt === response.prompt) {
    return response;
  }
  return redacted as T;
}

// `responseMetadata` is the (pre-redaction) provider response metadata, used as the provenance
// source so a legacy top-level `metadata.headers` is redacted only where it echoes the
// transport — leaving user-authored test metadata headers intact.
function sanitizeMetadataForDb<T>(metadata: T, responseMetadata?: unknown): T {
  return sanitizeCompletedTargetResponses(
    redactHttpHeadersOnMetadata(metadata, {
      legacyHeadersSource: sanitizeForDb(responseMetadata),
    }),
  );
}

/** Traverse only the evaluator-owned interrupted-strategy checkpoint schema. */
function mapCompletedTargetResponses<T>(
  metadata: T,
  project: (entry: Record<string, unknown> & { response: ProviderResponse }) => unknown,
  projectUnsupported?: (value: unknown) => unknown,
): T {
  const record = asRecord(metadata);
  if (record?.interruptedStrategy !== true) {
    return metadata;
  }
  if (!Array.isArray(record.completedTargetResponses)) {
    return projectUnsupported && 'completedTargetResponses' in record
      ? ({
          ...record,
          completedTargetResponses: projectUnsupported(record.completedTargetResponses),
        } as T)
      : metadata;
  }
  return {
    ...record,
    completedTargetResponses: record.completedTargetResponses.map((entry) => {
      const target = asRecord(entry);
      const response = asRecord(target?.response);
      return target && response
        ? project({ ...target, response })
        : projectUnsupported
          ? projectUnsupported(entry)
          : entry;
    }),
  } as T;
}

function sanitizeCompletedTargetResponses<T>(metadata: T): T {
  return mapCompletedTargetResponses(metadata, (entry) => ({
    ...entry,
    ...('prompt' in entry ? { prompt: sanitizeForDbWithSecrets(entry.prompt) } : {}),
    response: sanitizeResponseForDb(entry.response),
  }));
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

function sanitizeGradingResultForDb<T>(gradingResult: T): T {
  return redactHttpHeadersOnGradingResult(sanitizeGradingResultAssertions(gradingResult));
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

// Shared by configuration and result-row output projections.
export function getStripFlags(env?: EnvOverrides) {
  const getFlag = (key: EnvVarKey) => {
    const value = env?.[key];
    return value === undefined ? getEnvBool(key, false) : parseEnvBool(String(value), false);
  };
  return {
    shouldStripPromptText: getFlag('PROMPTFOO_STRIP_PROMPT_TEXT'),
    shouldStripResponseOutput: getFlag('PROMPTFOO_STRIP_RESPONSE_OUTPUT'),
    shouldStripTestVars: getFlag('PROMPTFOO_STRIP_TEST_VARS'),
    shouldStripGradingResult: getFlag('PROMPTFOO_STRIP_GRADING_RESULT'),
    shouldStripMetadata: getFlag('PROMPTFOO_STRIP_METADATA'),
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
export function sanitizeResultForJsonlArtifact<T extends object>(
  result: T,
  stripFlags = getStripFlags(),
): T {
  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  } = stripFlags;

  const artifactResult = serializeResultProviderRefs(result) as T & Record<string, unknown>;
  const redacted = redactSensitiveResultFieldsForDb({
    response: sanitizeForDb(artifactResult.response as ProviderResponse | null | undefined),
    gradingResult: sanitizeForDb(artifactResult.gradingResult),
    metadata: sanitizeForDb(artifactResult.metadata),
  });
  const response = projectProviderResponse(redacted.response ?? undefined, {
    stripMetadata: shouldStripMetadata,
    stripOutput: shouldStripResponseOutput,
    stripPromptText: shouldStripPromptText,
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
              stripOutput: shouldStripResponseOutput,
              stripPromptText: shouldStripPromptText,
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
    gradingResult: shouldStripGradingResult
      ? null
      : projectGradingResult(redacted.gradingResult, shouldStripPromptText),
    namedScores: sanitizeForDb(artifactResult.namedScores),
    metadata: shouldStripMetadata
      ? {}
      : projectOutputMetadata(
          redacted.metadata,
          {
            stripMetadata: shouldStripMetadata,
            stripOutput: shouldStripResponseOutput,
            stripPromptText: shouldStripPromptText,
          },
          redacted.response?.metadata,
          (artifactResult.testCase as AtomicTestCase | undefined)?.metadata,
        ),
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
    } = serializeResultProviderRefs(result);

    // Persist trace linkage inside a private metadata namespace so it survives
    // EvalResult round-trips without a Drizzle schema migration.
    const persistedMetadata = persistTraceMetadata(metadata, traceId, evaluationId);

    // In-memory evaluations and failed-write reconstruction have no persisted
    // parent guaranteed to own blob references. Keep their media inline.
    const fields = {
      response: snapshotForMediaExtraction(result.response),
      metadata: snapshotForMediaExtraction(persistedMetadata),
    };
    const processed = persist
      ? await extractAndStoreResultMedia(fields, {
          evalId,
          testIdx: result.testIdx,
          promptIdx: result.promptIdx,
        })
      : fields;

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
      testCase: sanitizeForDbWithSecrets(testCase),
      promptIdx: result.promptIdx,
      testIdx: result.testIdx,
      prompt: sanitizeForDbWithSecrets(prompt),
      promptId: hashPrompt(prompt),
      error: error?.toString(),
      success,
      score: score == null ? 0 : score,
      response: sanitizeForDb(processed.response || null),
      gradingResult: sanitizeForDb(gradingResult || null),
      namedScores: sanitizeForDb(namedScores),
      provider: sanitizeProvider(provider),
      latencyMs,
      cost,
      metadata: sanitizeForDb(processed.metadata),
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
      const processed = isBlobStorageEnabled()
        ? await extractAndStoreResultMedia(
            {
              response: snapshotForMediaExtraction(result.response),
              metadata: snapshotForMediaExtraction(result.metadata),
            },
            { evalId, testIdx: result.testIdx, promptIdx: result.promptIdx },
          )
        : { response: result.response, metadata: result.metadata };
      processedResults.push({
        ...serializeResultProviderRefs(result),
        response: processed.response ?? undefined,
        metadata: processed.metadata,
      });
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
    const {
      traceId: _traceId,
      evaluationId: _evaluationId,
      pluginId: _pluginId,
      ...rest
    } = serializeResultProviderRefs(this);
    const processed = await extractAndStoreResultMedia(
      {
        response: snapshotForMediaExtraction(rest.response),
        metadata: snapshotForMediaExtraction(
          persistTraceMetadata(this.metadata, this.traceId, this.evaluationId),
        ),
      },
      { evalId: this.evalId, testIdx: this.testIdx, promptIdx: this.promptIdx },
      async () => {
        // Later updates run outside the evaluation's scoped env. Read its current
        // policy only when the extractor finds media eligible for externalization.
        const savedPolicy = await db
          .select({
            inlineMedia: sql<string | null>`CASE WHEN json_valid(${evalsTable.config})
              THEN ${evalsTable.config} -> '$.env.PROMPTFOO_INLINE_MEDIA' END`,
          })
          .from(evalsTable)
          .where(eq(evalsTable.id, this.evalId))
          .get();
        // SQL NULL means absent; JSON null and other explicit values keep their types.
        const inlineMedia =
          savedPolicy?.inlineMedia == null ? undefined : JSON.parse(savedPolicy.inlineMedia);
        return inlineMedia === undefined
          ? isBlobStorageEnabled()
          : !parseEnvBool(String(inlineMedia), false);
      },
    );
    const persistedValues = {
      ...rest,
      error: this.error ?? null,
      ...redactSensitiveResultFieldsForDb({
        response: sanitizeForDb(processed.response),
        gradingResult: sanitizeForDb(rest.gradingResult),
        metadata: sanitizeForDb(processed.metadata),
      }),
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

  toEvaluateResult(stripFlags = getStripFlags()): EvaluateResult {
    const {
      shouldStripPromptText,
      shouldStripResponseOutput,
      shouldStripTestVars,
      shouldStripGradingResult,
      shouldStripMetadata,
    } = stripFlags;

    const response = projectProviderResponse(this.response, {
      stripMetadata: shouldStripMetadata,
      stripOutput: shouldStripResponseOutput,
      stripPromptText: shouldStripPromptText,
    });

    const prompt = projectPrompt(this.prompt, shouldStripPromptText);

    const testCase = projectTestCase(this.testCase, {
      stripMetadata: shouldStripMetadata,
      stripVars: shouldStripTestVars,
      stripOutput: shouldStripResponseOutput,
      stripPromptText: shouldStripPromptText,
    });
    // Mirror the live accounting in the evaluator: a response counts as one provider
    // request even when it reports no token usage, and a grading result counts as one
    // assertion request (with its tokens folded in when present).
    const tokenUsage = createEmptyTokenUsage();
    if (this.response) {
      accumulateResponseTokenUsage(tokenUsage, this.response);
    }
    if (this.gradingResult) {
      accumulateGradingTokenUsage(tokenUsage, this.gradingResult.tokensUsed, {
        cached: this.gradingResult.metadata?.cachedResponse,
      });
    }

    return {
      cost: this.cost,
      ...(this.response?.incurredCost !== undefined && {
        incurredCost: this.response.incurredCost,
      }),
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: shouldStripGradingResult
        ? null
        : projectGradingResult(this.gradingResult, shouldStripPromptText),
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
      metadata: shouldStripMetadata
        ? {}
        : projectOutputMetadata(
            this.metadata,
            {
              stripMetadata: shouldStripMetadata,
              stripOutput: shouldStripResponseOutput,
              stripPromptText: shouldStripPromptText,
            },
            this.response?.metadata,
            this.testCase.metadata,
          ),
      failureReason: this.failureReason,
    };
  }
}

/** Normalize an `EvalResult` model instance or a plain `EvaluateResult` to `EvaluateResult`. */
export function asEvaluateResult(
  result: EvalResult | EvaluateResult,
  stripFlags = getStripFlags(),
): EvaluateResult {
  return 'toEvaluateResult' in result ? result.toEvaluateResult(stripFlags) : result;
}

/** Canonical `testIdx:promptIdx` key used to dedupe/look up a result across the streaming,
 * recovery, and comparison paths. */
export function getResultIndexKey(result: Pick<EvaluateResult, 'testIdx' | 'promptIdx'>): string {
  return `${result.testIdx}:${result.promptIdx}`;
}
