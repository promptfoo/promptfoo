import { isDeepStrictEqual } from 'node:util';

import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import { type EnvVarKey, getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { PromptfooAttributes } from '../tracing/genaiTracer';
import { isApiProvider } from '../types/providers';
import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from '../util/gradingProvider';
import { safeJsonStringify } from '../util/json';
import {
  isSecretField,
  mapTestProviderRefs,
  REDACTED,
  sanitizeObject,
  snapshotJsonData,
  stripProviderPromptSelectors,
  stripTestProviderPromptSelectors,
} from '../util/sanitizer';

import type { ProviderConfig } from '../providers/shared';
import type {
  ApiProvider,
  Assertion,
  AssertionSet,
  AtomicTestCase,
  EnvOverrides,
  EvaluateResult,
  EvaluateSummaryV2,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
  TraceData,
} from '../types/index';

function sanitizeProviderConfig(config: ProviderConfig): ProviderConfig {
  try {
    return sanitizeObject(config, {
      context: 'provider config',
      sanitizeUrls: true,
      maxDepth: Number.POSITIVE_INFINITY,
      redactErrorMessages: true,
      omitCircularRefs: true,
      throwOnError: true,
    }) as ProviderConfig;
  } catch {
    logger.debug('Unable to sanitize provider config safely; omitting config fields');
    return {};
  }
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
  const projected = { ...prompt };
  if (projected.config !== undefined) {
    projected.config = sanitizePromptConfig(projected.config);
  }
  if ('provider' in projected && typeof projected.provider === 'string') {
    projected.provider = sanitizeObject(projected.provider, {
      sanitizeUrls: true,
      redactStringValues: false,
    });
  }
  return stripPromptText
    ? {
        ...projected,
        raw: '[prompt stripped]',
        template: undefined,
        ...(projected.config?.provider && {
          config: {
            ...projected.config,
            provider: stripProviderPromptSelectors(projected.config.provider),
          },
        }),
      }
    : projected;
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
export function mapGradingResultProviderRefs<T>(
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

// Project providers into their serializable, redacted public shape.
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
): ProviderOptions {
  if (typeof provider === 'string') {
    provider = { id: provider };
  }

  try {
    const { id, label, config } = provider;
    return {
      id: sanitizeObject(typeof id === 'function' ? id.call(provider) : id, {
        sanitizeUrls: true,
        redactStringValues: false,
      }),
      label,
      ...(config !== undefined && { config: sanitizeProviderConfig(config) }),
    };
  } catch {
    logger.debug('Unable to sanitize provider safely; omitting provider fields');
  }

  return { id: 'unknown' };
}

// Preserve string ids and provider maps before serialization can invoke toJSON.
function sanitizeProviderReference(provider: unknown, active = new WeakSet<object>()): unknown {
  if (typeof provider === 'string') {
    return sanitizeProvider(provider).id;
  }
  if (!provider || typeof provider !== 'object') {
    return provider;
  }
  if (active.has(provider)) {
    return {};
  }
  active.add(provider);
  try {
    if (Array.isArray(provider)) {
      return provider.map((entry) => sanitizeProviderReference(entry, active));
    }
    const descriptors = Object.getOwnPropertyDescriptors(provider);
    const id = getDataMethod(provider, 'id') ?? descriptors.id?.value;
    if (typeof id === 'function') {
      // Keep replay options from a live provider without running option getters or toJSON.
      const snapshot = {
        ...getDataProperties(provider),
        id: id.bind(provider),
        callApi: getDataMethod(provider, 'callApi'),
      };
      const reference = isApiProvider(snapshot)
        ? toSerializableProviderRef(snapshot)
        : {
            ...sanitizeProvider(snapshot as ProviderOptions),
            // Historical class instances can expose id() and selectors without callApi().
            prompts: descriptors.prompts?.enumerable ? descriptors.prompts.value : undefined,
          };
      return sanitizeForDbWithSecrets(reference);
    }
    if (typeof id === 'string') {
      const { id: _id, label, config, ...options } = getDataProperties(provider) as ProviderOptions;
      const sanitizedOptions = sanitizeForDbWithSecrets(options);
      return {
        ...(sanitizedOptions && typeof sanitizedOptions === 'object' ? sanitizedOptions : {}),
        ...sanitizeProvider({ id, label, config }),
      };
    }
    if ('env' in provider) {
      return sanitizeForDbWithSecrets(provider);
    }
    const usedKeys = new Set<string>();
    return Object.fromEntries(
      Object.entries(descriptors)
        .filter(
          ([key, descriptor]) => key !== 'toJSON' && descriptor.enumerable && 'value' in descriptor,
        )
        .map(([key, descriptor]) => {
          const redactedKey = sanitizeObject(key, {
            sanitizeUrls: true,
            redactStringValues: false,
          });
          let uniqueKey = redactedKey;
          for (let suffix = 1; usedKeys.has(uniqueKey); suffix++) {
            uniqueKey = `${redactedKey}#${suffix}`;
          }
          usedKeys.add(uniqueKey);
          return [
            uniqueKey,
            isSecretField(key) &&
            !(
              descriptor.value &&
              typeof descriptor.value === 'object' &&
              !Array.isArray(descriptor.value) &&
              (Object.keys(descriptor.value).length === 0 ||
                ['id', 'label', 'config', 'prompts', 'transform', 'delay', 'env', 'inputs'].some(
                  (option) => Object.prototype.hasOwnProperty.call(descriptor.value, option),
                ))
            )
              ? REDACTED
              : sanitizeForDbWithSecrets(sanitizeProviderReference(descriptor.value, active)),
          ];
        }),
    );
  } finally {
    active.delete(provider);
  }
}

function getDataMethod(value: object, key: string): unknown {
  for (let current: object | null = value; current; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor && 'value' in descriptor) {
      return descriptor.value;
    }
  }
}

function getDataProperties(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(Object.getOwnPropertyDescriptors(value))
      .filter(
        ([key, descriptor]) => key !== 'toJSON' && descriptor.enumerable && 'value' in descriptor,
      )
      .map(([key, descriptor]) => [key, descriptor.value]),
  );
}

/** Snapshot live provider references for replay without retaining runtime client state. */
export function toSerializableProviderRef(provider: unknown): unknown {
  if (isApiProvider(provider)) {
    const reference = sanitizeProvider(provider);
    if (reference.config === REDACTED) {
      // Preserve the empty objects historically exported for these Maps without reading their entries.
      for (const key of ['threadPromiseConnectionInstances', 'threadRunQueues', 'sessionQueues']) {
        const field = Object.getOwnPropertyDescriptor(provider, key);
        if (field?.enumerable && field.value instanceof Map) {
          Object.assign(reference, { [key]: {} });
        }
      }
    }
    return {
      ...reference,
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
      logger.debug('sanitizeForDb: Failed to serialize object, using fallback', {
        valueType: typeof obj,
        isArray: Array.isArray(obj),
      });
      return (Array.isArray(obj) ? [] : null) as T;
    }
    return JSON.parse(serialized);
  } catch {
    logger.debug('sanitizeForDb: Parse error, using fallback');
    return (Array.isArray(obj) ? [] : null) as T;
  }
}

// Test cases and prompts can carry resolved grader providers with credential-bearing
// SDK clients. Traverse the full object depth and fail closed if serialization fails.
function sanitizeForDbWithSecrets<T>(obj: T, redactStringValues = true): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  let isArray = false;
  try {
    isArray = Array.isArray(obj);
    return sanitizeObject(obj, {
      context: 'evalResult field',
      // Nested provider configs can be deeper than the default maxDepth (4);
      // match the behavior of `sanitizeConfigForOutput` in `src/util/output.ts`.
      maxDepth: Number.POSITIVE_INFINITY,
      redactErrorMessages: true,
      redactStringValues,
      sanitizeUrls: redactStringValues,
      throwOnError: true,
    }) as T;
  } catch {
    logger.debug('Unable to sanitize eval result field safely; omitting field contents');
    return (isArray ? [] : typeof obj === 'object' ? {} : null) as T;
  }
}

function sanitizeAssertionForDb(assertion: Assertion | AssertionSet): Assertion | AssertionSet {
  if (!assertion || typeof assertion !== 'object') {
    return sanitizeForDbWithSecrets(assertion) as Assertion;
  }
  const captured = getDataProperties(assertion) as Assertion | AssertionSet;
  if ('assert' in captured) {
    const { assert, ...withoutAssertions } = captured;
    if (Array.isArray(assert)) {
      return {
        ...sanitizeForDbWithSecrets(withoutAssertions),
        assert: assert.map(sanitizeAssertionForDb) as Assertion[],
      };
    }
    return sanitizeForDbWithSecrets(captured);
  }
  const { provider, ...withoutProvider } = captured;
  return {
    ...sanitizeForDbWithSecrets(withoutProvider),
    value: sanitizeForDb(captured.value),
    ...(captured.rubricPrompt !== undefined && {
      rubricPrompt: sanitizeForDbWithSecrets(captured.rubricPrompt, false),
    }),
    ...(provider && { provider: sanitizeProviderReference(provider) }),
  };
}

// Prompt text and test inputs can contain legitimate hashes, base64, or JSON.
// Preserve those data fields while keeping value-based redaction on configuration.
export function sanitizeTestCaseForDb(testCase: AtomicTestCase): AtomicTestCase {
  if (!testCase) {
    return testCase;
  }
  try {
    const { provider, assert, options, vars, providerOutput, ...fields } = getDataProperties(
      testCase,
    ) as AtomicTestCase;
    const optionsRecord =
      options && typeof options === 'object' && !Array.isArray(options) ? options : undefined;
    const { provider: optionProvider, ...optionFields } = optionsRecord ?? {};
    const sanitized = sanitizeForDbWithSecrets({
      ...fields,
      ...(options && { options: optionsRecord ? optionFields : options }),
      ...(assert !== undefined && !Array.isArray(assert) && { assert }),
    }) as AtomicTestCase;
    if (optionProvider !== undefined && sanitized.options) {
      sanitized.options.provider = sanitizeProviderReference(optionProvider);
    }
    if (vars) {
      sanitized.vars = sanitizeForDbWithSecrets(vars, false);
    }
    if (provider !== undefined) {
      sanitized.provider = sanitizeProviderReference(provider) as AtomicTestCase['provider'];
    }
    if (providerOutput !== undefined) {
      sanitized.providerOutput = sanitizeForDbWithSecrets(providerOutput, false);
    }
    if (optionFields.rubricPrompt !== undefined) {
      sanitized.options = {
        ...sanitized.options,
        rubricPrompt: sanitizeForDbWithSecrets(optionFields.rubricPrompt, false),
      };
    }
    for (const key of ['prefix', 'suffix'] as const) {
      if (optionFields[key] !== undefined) {
        sanitized.options = {
          ...sanitized.options,
          [key]: sanitizeForDbWithSecrets(optionFields[key], false),
        };
      }
    }
    if (Array.isArray(assert)) {
      sanitized.assert = assert.map(sanitizeAssertionForDb);
    }
    return sanitized;
  } catch {
    logger.debug('Unable to sanitize test case safely; omitting field contents');
    return {} as AtomicTestCase;
  }
}

function sanitizePromptConfig(config: Prompt['config']): Prompt['config'] {
  if (!config || typeof config !== 'object' || !('provider' in config)) {
    return sanitizeForDbWithSecrets(config);
  }
  const { provider, ...options } = config;
  return {
    ...sanitizeForDbWithSecrets(options),
    ...(provider !== undefined && { provider: sanitizeProviderReference(provider) }),
  };
}

export function sanitizePromptForDb(prompt: Prompt): Prompt {
  if (!prompt) {
    return prompt;
  }
  try {
    // Object rest on Node 22 can invoke an excluded getter twice. Capture each field once.
    const { config, ...fields } = { ...prompt };
    return {
      ...sanitizeForDbWithSecrets(fields, false),
      ...(config !== undefined && { config: sanitizePromptConfig(config) }),
    };
  } catch {
    logger.debug('Unable to sanitize prompt safely; omitting field contents');
    return {} as Prompt;
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

// Legacy metadata can also hold unrelated user headers. Match every transport spelling
// of a header and mask possible echoes when its source value could not be read.
function redactSensitiveHeaders(
  headers: Record<string, unknown>,
  sourceHeaders: Record<string, unknown> = headers,
  isSensitiveHeader: (headerName: string) => boolean = isSensitiveResponseHeader,
): Record<string, unknown> | null {
  const sources: Record<string, unknown[]> | undefined =
    sourceHeaders === headers ? undefined : Object.create(null);
  if (sources) {
    for (const [name, source] of Object.entries(sourceHeaders)) {
      (sources[name.toLowerCase()] ??= []).push(source);
    }
  }
  let next: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(headers)) {
    if (
      isSensitiveHeader(key) &&
      (!sources ||
        sources[key.toLowerCase()]?.some(
          (source) => source === REDACTED || isDeepStrictEqual(source, value),
        ))
    ) {
      next ??= { ...headers };
      next[key] = REDACTED;
    }
  }
  return next;
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

// Redact transport headers and assertion configs on each grading component.
function sanitizeGradingResultForDb<T>(gradingResult: T, seen = new WeakSet<object>()): T {
  if (!gradingResult || typeof gradingResult !== 'object' || Array.isArray(gradingResult)) {
    return sanitizeForDbWithSecrets(gradingResult) as T;
  }
  if (seen.has(gradingResult)) {
    return {} as T;
  }
  seen.add(gradingResult);
  try {
    const next = getDataProperties(gradingResult);
    const { metadata, assertion, componentResults } = next;

    if (metadata !== undefined) {
      try {
        next.metadata =
          metadata === null
            ? null
            : (redactHttpHeadersOnMetadata(snapshotMetadata(metadata)) ?? {});
      } catch {
        next.metadata = {};
      }
    }

    if (asRecord(assertion)) {
      try {
        next.assertion = sanitizeAssertionForDb(assertion as Assertion | AssertionSet);
      } catch {
        next.assertion = {};
      }
    }

    if (Array.isArray(componentResults)) {
      next.componentResults = componentResults.map((component) =>
        sanitizeGradingResultForDb(component, seen),
      );
    }

    return next as T;
  } finally {
    seen.delete(gradingResult);
  }
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

// Preserve literal transcripts while preventing custom serializers from moving
// credentials outside known transport header slots.
function snapshotMetadata<T>(metadata: T): T {
  try {
    return sanitizeForDb(snapshotJsonData(metadata)) as T;
  } catch {
    return REDACTED as T;
  }
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

// Read live response accessors once, before media extraction or serialization.
export function captureResponseFields<M>(
  response: ProviderResponse | null | undefined,
  metadata: M,
) {
  let captured;
  try {
    captured = response && { ...response, toJSON: undefined };
    if (!captured?.metadata) {
      return { response: captured, metadata };
    }
    captured.metadata = snapshotMetadata(captured.metadata);
    const source = asRecord(captured.metadata);
    if (source && source.headers !== REDACTED) {
      return { response: captured, metadata };
    }
  } catch {
    captured = null;
  }
  // If transport headers cannot be read, conservatively mask possible echoes.
  return {
    response: captured,
    metadata: redactHttpHeadersOnMetadata(snapshotMetadata(metadata), {
      redactLegacyHeaders: true,
    }),
  };
}

// Share response, grading, and metadata redaction between DB and JSONL writes.
function redactSensitiveResultFieldsForDb<
  R extends ProviderResponse | null | undefined,
  G,
  M,
>(fields: { response: R; gradingResult: G; metadata: M }) {
  const { response, metadata } = captureResponseFields(fields.response, fields.metadata);
  return {
    response: sanitizeResponseForDb(sanitizeForDb(response as R)),
    gradingResult: sanitizeForDb(sanitizeGradingResultForDb(fields.gradingResult)),
    metadata: redactHttpHeadersOnMetadata(snapshotMetadata(metadata), {
      legacyHeadersSource: response?.metadata,
    }),
  };
}

// Project mutable or imported result fields immediately before a database write.
export function sanitizeResultFieldsForDb(
  result: Omit<
    Pick<
      EvaluateResult,
      | 'testCase'
      | 'prompt'
      | 'provider'
      | 'namedScores'
      | 'metadata'
      | 'traceId'
      | 'evaluationId'
      | 'repeatIndex'
      | 'repeatGroupId'
    >,
    'namedScores' | 'metadata'
  > & {
    namedScores?: EvaluateResult['namedScores'] | null;
    metadata?: EvaluateResult['metadata'] | null;
    response?: ProviderResponse | null;
    gradingResult?: GradingResult | null;
  },
  persistedMetadata = persistTraceMetadata(
    persistRepeatMetadata(result.metadata ?? undefined, result.repeatIndex, result.repeatGroupId),
    result.traceId,
    result.evaluationId,
  ),
) {
  return {
    testCase: sanitizeTestCaseForDb(result.testCase),
    prompt: sanitizePromptForDb(result.prompt),
    provider: sanitizeProvider(result.provider),
    namedScores: sanitizeForDb(result.namedScores),
    ...redactSensitiveResultFieldsForDb({
      response: result.response,
      gradingResult: result.gradingResult,
      metadata: persistedMetadata,
    }),
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

  const artifactResult = result as T & Record<string, unknown>;
  const redacted = redactSensitiveResultFieldsForDb({
    response: artifactResult.response as ProviderResponse | null | undefined,
    gradingResult: artifactResult.gradingResult,
    metadata: artifactResult.metadata,
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
            sanitizeTestCaseForDb(artifactResult.testCase as AtomicTestCase),
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
          vars: shouldStripTestVars ? {} : sanitizeForDbWithSecrets(artifactResult.vars, false),
        }),
    ...(artifactResult.prompt
      ? {
          prompt: projectPrompt(
            sanitizePromptForDb(artifactResult.prompt as Prompt),
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

// Legacy imports store the result rows and table together in evals.results.
export function sanitizeLegacyResults(results: EvaluateSummaryV2): EvaluateSummaryV2 {
  const stripFlags = {
    shouldStripPromptText: false,
    shouldStripResponseOutput: false,
    shouldStripTestVars: false,
    shouldStripGradingResult: false,
    shouldStripMetadata: false,
  };
  const table = { ...results.table };
  if (Array.isArray(table.head?.prompts)) {
    table.head = {
      ...table.head,
      prompts: table.head.prompts.map((prompt) => {
        if (!asRecord(prompt)) {
          return prompt;
        }
        const { metrics, ...definition } = prompt;
        return {
          ...sanitizePromptForDb(definition),
          ...(metrics !== undefined && { metrics: sanitizeForDb(metrics) }),
          provider: sanitizeObject(prompt.provider, {
            sanitizeUrls: true,
            redactStringValues: false,
          }),
        };
      }),
    };
  }
  if (Array.isArray(table.body)) {
    table.body = table.body.map((row) => {
      if (!asRecord(row)) {
        return row;
      }
      return {
        ...row,
        test: sanitizeTestCaseForDb(row.test),
        ...(Array.isArray(row.outputs) && {
          outputs: row.outputs.map((output) => {
            if (!asRecord(output)) {
              return output;
            }
            return {
              ...output,
              provider: sanitizeObject(output.provider, {
                sanitizeUrls: true,
                redactStringValues: false,
              }),
              testCase: sanitizeTestCaseForDb(output.testCase),
              ...redactSensitiveResultFieldsForDb({
                response: output.response,
                gradingResult: output.gradingResult,
                metadata: output.metadata,
              }),
            };
          }),
        }),
      };
    });
  }
  return {
    ...results,
    results: results.results.map((result) =>
      asRecord(result) ? sanitizeResultForJsonlArtifact(result, stripFlags) : result,
    ),
    table,
  };
}
