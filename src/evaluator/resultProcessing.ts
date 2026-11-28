import { isDeepStrictEqual } from 'node:util';

import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import { type EnvVarKey, getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { PromptfooAttributes } from '../tracing/genaiTracer';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EnvOverrides,
  type EvaluateResult,
  type ExactHistoricalReplayPlan,
  type ExactHistoricalSource,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  type TestCase,
  TestCaseSchema,
  type TestSuite,
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

import type { ProviderConfig } from '../providers/shared';

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

export function projectOutputMetadata<T>(
  metadata: T,
  stripOutput: boolean,
  responseMetadata: ProviderResponse['metadata'],
  testMetadata?: AtomicTestCase['metadata'],
): T {
  if (!stripOutput || !metadata || !responseMetadata || typeof metadata !== 'object') {
    return metadata;
  }
  return Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (
        !Object.prototype.hasOwnProperty.call(responseMetadata, key) ||
        (testMetadata && isDeepStrictEqual(value, testMetadata[key]))
      ) {
        return [[key, value]];
      }
      return key === 'audio' || key === 'blobUris'
        ? []
        : [[key, stripMediaReferences(sanitizeForDb(value))]];
    }),
  ) as T;
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

  const projectedResponse: ProviderResponse = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(response)
    : { ...response };

  if (options.stripOutput) {
    projectedResponse.output = '[output stripped]';
    delete projectedResponse.raw;
    delete projectedResponse.providerTransformedOutput;
    delete projectedResponse.conversationOutput;
    delete projectedResponse.audio;
    delete projectedResponse.video;
    delete projectedResponse.images;
    if (projectedResponse.metadata) {
      projectedResponse.metadata = projectOutputMetadata(
        projectedResponse.metadata,
        true,
        projectedResponse.metadata,
      );
    }
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

export function projectTestCase(
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
export function projectGradingResult<T>(gradingResult: T, stripPromptText: boolean): T {
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
export function serializeResultProviderRefs<T extends object>(result: T): T {
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

export function sanitizeGradingResultForDb<T>(gradingResult: T): T {
  return redactHttpHeadersOnGradingResult(sanitizeGradingResultAssertions(gradingResult));
}

// `__promptfoo` is reserved at the metadata top level for promptfoo-internal namespaced data
// (currently `traceLinkage` and `repeatLinkage`). User-supplied non-object values are overwritten —
// log so the rare collision is visible. Mirrored in `EvalQueries.getMetadataKeysFromEval` /
// `getMetadataValuesFromEval`, which hide the namespace from the metadata-discovery API.
export const PROMPTFOO_METADATA_KEY = '__promptfoo';
const TRACE_LINKAGE_KEY = 'traceLinkage';
const REPEAT_LINKAGE_KEY = 'repeatLinkage';

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

export function persistRepeatMetadata(
  metadata: EvaluateResult['metadata'],
  repeatIndex: EvaluateResult['repeatIndex'],
  repeatGroupId: EvaluateResult['repeatGroupId'],
): EvaluateResult['metadata'] {
  if (repeatIndex === undefined || !repeatGroupId) {
    return stripRepeatLinkageFromMetadata(metadata);
  }

  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  if (metadataRecord[PROMPTFOO_METADATA_KEY] !== undefined && promptfooMetadata === undefined) {
    logger.warn(
      `[EvalResult] Overwriting non-object metadata.${PROMPTFOO_METADATA_KEY} with internal repeat linkage; the key is reserved for promptfoo internals.`,
    );
  }
  if (promptfooMetadata && REPEAT_LINKAGE_KEY in promptfooMetadata) {
    logger.warn(
      `[EvalResult] Overwriting metadata.${PROMPTFOO_METADATA_KEY}.${REPEAT_LINKAGE_KEY} with internal repeat linkage; the path is reserved for promptfoo internals.`,
    );
  }

  return {
    ...metadataRecord,
    [PROMPTFOO_METADATA_KEY]: {
      ...(promptfooMetadata ?? {}),
      [REPEAT_LINKAGE_KEY]: { repeatIndex, repeatGroupId },
    },
  };
}

export function stripRepeatLinkageFromMetadata<
  T extends Record<string, unknown> | null | undefined,
>(metadata: T): T {
  const metadataRecord = asRecord(metadata);
  const promptfooMetadata = asRecord(metadataRecord?.[PROMPTFOO_METADATA_KEY]);
  if (!metadataRecord || !promptfooMetadata || !(REPEAT_LINKAGE_KEY in promptfooMetadata)) {
    return metadata;
  }

  const { [REPEAT_LINKAGE_KEY]: _repeatLinkage, ...remainingPromptfooMetadata } = promptfooMetadata;
  const strippedMetadata = { ...metadataRecord };
  delete strippedMetadata[PROMPTFOO_METADATA_KEY];
  if (Object.keys(remainingPromptfooMetadata).length > 0) {
    strippedMetadata[PROMPTFOO_METADATA_KEY] = remainingPromptfooMetadata;
  }

  return strippedMetadata as T;
}

export function surfaceRepeatMetadata(metadata: Record<string, unknown> | null | undefined): {
  repeatIndex?: number;
  repeatGroupId?: string;
  metadata: Record<string, unknown>;
} {
  const metadataRecord = metadata ?? {};
  const promptfooMetadata = asRecord(metadataRecord[PROMPTFOO_METADATA_KEY]);
  const repeatLinkage = asRecord(promptfooMetadata?.[REPEAT_LINKAGE_KEY]);

  const repeatIndex =
    typeof repeatLinkage?.repeatIndex === 'number' &&
    Number.isInteger(repeatLinkage.repeatIndex) &&
    repeatLinkage.repeatIndex >= 0
      ? repeatLinkage.repeatIndex
      : undefined;
  const repeatGroupId =
    typeof repeatLinkage?.repeatGroupId === 'string' && repeatLinkage.repeatGroupId.length > 0
      ? repeatLinkage.repeatGroupId
      : undefined;

  const hasRepeatLinkage = promptfooMetadata != null && REPEAT_LINKAGE_KEY in promptfooMetadata;
  return {
    repeatIndex,
    repeatGroupId,
    metadata: hasRepeatLinkage ? stripRepeatLinkageFromMetadata(metadataRecord) : metadataRecord,
  };
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
          shouldStripResponseOutput,
          redacted.response?.metadata,
          (artifactResult.testCase as AtomicTestCase | undefined)?.metadata,
        ),
  } as T;
}

type PreparedHistoricalCandidate = { test: AtomicTestCase; source: ExactHistoricalSource };

const UNSAFE_PLAN_MESSAGE =
  'Could not safely save the prepared exact historical selection. Use --no-write for this run or remove protected/unserializable test values.';

function providerIdentity(provider: AtomicTestCase['provider']) {
  if (provider === undefined) {
    return undefined;
  }
  const id = isApiProvider(provider)
    ? provider.id()
    : typeof provider === 'string'
      ? provider
      : typeof provider === 'object' && provider && typeof provider.id === 'string'
        ? provider.id
        : undefined;
  if (typeof id !== 'string' || !id) {
    throw new Error(UNSAFE_PLAN_MESSAGE);
  }
  const label =
    typeof provider === 'object' && provider && typeof provider.label === 'string'
      ? provider.label
      : undefined;
  return { id, ...(label && { label }) };
}

/** A positional source cannot safely distinguish two live targets with the same public identity. */
export function assertUnambiguousHistoricalProviders(
  candidates: PreparedHistoricalCandidate[],
): void {
  const providersByIdentity = new Map<string, ApiProvider>();
  for (const { test } of candidates) {
    if (!isApiProvider(test.provider)) {
      continue;
    }
    const provider = test.provider;
    const identity = JSON.stringify(providerIdentity(provider));
    const previous = providersByIdentity.get(identity);
    if (previous && previous !== provider) {
      throw new Error(
        'Prepared historical tests have distinct providers with the same id and label. Give them distinct identities before saving or replaying this selection.',
      );
    }
    providersByIdentity.set(identity, provider);
  }
}

function snapshotTest(test: AtomicTestCase): TestCase {
  // Exclude internal Symbols, the live target instance and input transforms. The latter must
  // never run on an already prepared case during replay.
  const { provider: _provider, ...fields } = Object.fromEntries(Object.entries(test)) as TestCase;
  const options = fields.options
    ? Object.fromEntries(Object.entries(fields.options).filter(([key]) => key !== 'transformVars'))
    : undefined;
  return omitUndefined(
    mapTestProviderRefs({ ...fields, ...(options && { options }) }, (nestedProvider) => {
      if (isApiProvider(nestedProvider)) {
        throw new Error(UNSAFE_PLAN_MESSAGE);
      }
      return nestedProvider;
    }),
  ) as TestCase;
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitUndefined);
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, omitUndefined(item)]),
  );
}

/** Build a lossless JSON snapshot before any selected case can call a provider. */
export function createExactHistoricalReplayPlan(
  candidates: PreparedHistoricalCandidate[],
): ExactHistoricalReplayPlan {
  try {
    const plan: ExactHistoricalReplayPlan = {
      version: 1,
      cases: candidates.map(({ source, test }) => {
        const identity = providerIdentity(test.provider);
        return {
          source,
          test: snapshotTest(test),
          ...(identity && { providerIdentity: identity }),
        };
      }),
    };
    const json = JSON.stringify(plan);
    if (!json || !isDeepStrictEqual(plan, JSON.parse(json))) {
      throw new Error(UNSAFE_PLAN_MESSAGE);
    }
    const sanitized = sanitizeObject(plan, {
      context: 'prepared exact historical selection',
      sanitizeUrls: true,
      maxDepth: Number.POSITIVE_INFINITY,
      throwOnError: true,
    });
    if (!isDeepStrictEqual(plan, sanitized)) {
      throw new Error(UNSAFE_PLAN_MESSAGE);
    }
    validateExactHistoricalReplayPlan(plan);
    return plan;
  } catch {
    throw new Error(UNSAFE_PLAN_MESSAGE);
  }
}

function validSource(source: unknown): source is ExactHistoricalSource {
  if (!source || typeof source !== 'object') {
    return false;
  }
  const value = source as Record<string, unknown>;
  if (value.kind === 'top-level') {
    return Number.isInteger(value.testIndex) && (value.testIndex as number) >= -1;
  }
  return (
    value.kind === 'scenario' &&
    Number.isInteger(value.scenarioIndex) &&
    (value.scenarioIndex as number) >= 0 &&
    Number.isInteger(value.variantIndex) &&
    (value.variantIndex as number) >= 0 &&
    Number.isInteger(value.testIndex) &&
    (value.testIndex as number) >= -1
  );
}

/** Reject malformed or unsupported persisted plans before any provider call. */
export function validateExactHistoricalReplayPlan(value: unknown): ExactHistoricalReplayPlan {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid prepared exact historical replay plan');
  }
  const plan = value as Partial<ExactHistoricalReplayPlan>;
  if (
    plan.version !== 1 ||
    !Array.isArray(plan.cases) ||
    !plan.cases.every(
      (item) =>
        item &&
        validSource(item.source) &&
        item.test &&
        typeof item.test === 'object' &&
        !Array.isArray(item.test) &&
        Object.getPrototypeOf(item.test) === Object.prototype &&
        !Object.prototype.hasOwnProperty.call(item.test, 'provider') &&
        !(
          item.test.options &&
          Object.prototype.hasOwnProperty.call(item.test.options, 'transformVars')
        ) &&
        TestCaseSchema.safeParse(item.test).success &&
        (item.providerIdentity === undefined ||
          (item.providerIdentity !== null &&
            typeof item.providerIdentity === 'object' &&
            typeof item.providerIdentity.id === 'string' &&
            (item.providerIdentity.label === undefined ||
              typeof item.providerIdentity.label === 'string'))),
    )
  ) {
    throw new Error('Invalid prepared exact historical replay plan');
  }
  try {
    if (!isDeepStrictEqual(plan, JSON.parse(JSON.stringify(plan)))) {
      throw new Error('Invalid prepared exact historical replay plan');
    }
  } catch {
    throw new Error('Invalid prepared exact historical replay plan');
  }
  return plan as ExactHistoricalReplayPlan;
}

export function restoreExactHistoricalReplayCases(
  plan: ExactHistoricalReplayPlan,
  current: PreparedHistoricalCandidate[],
  suite: TestSuite,
  syntheticProvider?: AtomicTestCase['provider'],
  syntheticScenarioProviders?: Map<string, AtomicTestCase['provider']>,
): PreparedHistoricalCandidate[] {
  const bySource = new Map(
    current.map((candidate) => [JSON.stringify(candidate.source), candidate]),
  );
  return plan.cases.map(({ source, test, providerIdentity: savedProvider }) => {
    if (
      source.kind === 'scenario' &&
      !suite.scenarios?.[source.scenarioIndex]?.config?.[source.variantIndex]
    ) {
      throw new Error('Could not resolve a prepared historical scenario for replay');
    }
    const currentCase = bySource.get(JSON.stringify(source));
    const currentProvider =
      currentCase?.test.provider ??
      (source.testIndex === -1
        ? source.kind === 'scenario'
          ? syntheticScenarioProviders?.has(`${source.scenarioIndex}:${source.variantIndex}`)
            ? syntheticScenarioProviders.get(`${source.scenarioIndex}:${source.variantIndex}`)
            : syntheticProvider
          : syntheticProvider
        : undefined);
    if (savedProvider) {
      if (
        !currentProvider ||
        !isDeepStrictEqual(providerIdentity(currentProvider), savedProvider)
      ) {
        throw new Error('Could not resolve a prepared historical provider for replay');
      }
    } else if (currentProvider) {
      throw new Error('Prepared historical provider changed before replay');
    }
    if (!currentCase && source.testIndex !== -1) {
      throw new Error('Could not resolve a prepared historical test for replay');
    }
    // Hooks can mutate nested vars, assertions and options in place. Keep the validated,
    // persisted plan immutable so a later save or resume still uses the original selection.
    const executionTest = JSON.parse(JSON.stringify(test)) as TestCase;
    return {
      source,
      test: {
        ...executionTest,
        ...(currentProvider && { provider: currentProvider }),
      },
    };
  });
}
