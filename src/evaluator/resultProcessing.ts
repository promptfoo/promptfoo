import { isDeepStrictEqual } from 'node:util';

import { extractBlobHashesFromValue } from '../blobs/blobRefs';
import { type EnvVarKey, getEnvBool, parseEnvBool } from '../envars';
import logger from '../logger';
import { generateIdFromPrompt } from '../prompts/id';
import { GenAIAttributes, PromptfooAttributes } from '../tracing/genaiTracer';
import {
  COMMAND_ATTRIBUTE_KEYS,
  SEARCH_ATTRIBUTE_KEYS,
  TOOL_ARGUMENT_ATTRIBUTE_KEYS,
} from '../tracing/toolAttributes';
import { isApiProvider } from '../types/providers';
import { GRADING_PROVIDER_TYPE_KEYS, isProviderTypeMap } from '../util/gradingProvider';
import { safeJsonStringify } from '../util/json';
import {
  isSecretField,
  mapTestProviderRefs,
  OUTPUT_SANITIZE_MAX_DEPTH,
  REDACTED,
  sanitizeConfigForOutput,
  sanitizeObject,
  stripAssertionRubricPrompts,
  stripProviderPromptSelectors,
  stripTestProviderPromptSelectors,
} from '../util/sanitizer';
import { accumulateGradingTokenUsage, createEmptyTokenUsage } from '../util/tokenUsageUtils';

import type { ProviderConfig } from '../providers/shared';
import type {
  ApiProvider,
  AtomicTestCase,
  EnvOverrides,
  EvaluateResult,
  EvaluateSummaryV2,
  EvaluateSummaryV3,
  EvaluateTable,
  EvaluateTableOutput,
  GradingResult,
  Prompt,
  ProviderOptions,
  ProviderResponse,
  TraceData,
} from '../types/index';

function sanitizeProviderConfig(config: ProviderConfig, throwOnError = false): ProviderConfig {
  return sanitizeObject(JSON.parse(safeJsonStringify(config) as string), {
    context: 'provider config',
    sanitizeUrls: true,
    throwOnError,
    maxDepth: throwOnError ? OUTPUT_SANITIZE_MAX_DEPTH : Number.POSITIVE_INFINITY,
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
      return ['audio', 'blobUris', 'bestImageDescription', 'bestImageUrl'].includes(key)
        ? []
        : [[key, stripMediaReferences(sanitizeForDb(value))]];
    }),
  ) as T;
}

export function projectProviderResponse(
  response: ProviderResponse | undefined,
  options: {
    stripMetadata: boolean;
    stripOutput: boolean;
    stripPrompt: boolean;
    stripVars: boolean;
    stripGrading: boolean;
  },
): ProviderResponse | undefined {
  if (!response || !asRecord(response)) {
    return options.stripOutput && response != null ? { output: '[output stripped]' } : response;
  }

  if (
    !options.stripMetadata &&
    !options.stripOutput &&
    !options.stripPrompt &&
    !options.stripVars &&
    !options.stripGrading
  ) {
    return response;
  }

  const projectedResponse: ProviderResponse = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(response)
    : { ...response };

  if (options.stripOutput) {
    projectedResponse.output = '[output stripped]';
    delete projectedResponse.conversationOutput;
    delete projectedResponse.audio;
    delete projectedResponse.images;
    delete projectedResponse.video;
    delete projectedResponse.raw;
    delete projectedResponse.providerTransformedOutput;
    if (projectedResponse.guardrails) {
      const { reason: _reason, ...flags } = projectedResponse.guardrails;
      projectedResponse.guardrails = flags;
    }
  }

  if (options.stripPrompt) {
    // A display marker must not become provider-reported input on a later import.
    delete projectedResponse.prompt;
  }

  if (options.stripVars) {
    delete projectedResponse.materializedVars;
    delete projectedResponse.inputMaterialization;
  }

  if (projectedResponse.metadata) {
    projectedResponse.metadata = projectTranscriptMetadata(
      projectOutputMetadata(
        projectedResponse.metadata,
        options.stripOutput,
        projectedResponse.metadata,
      ),
      options,
    );
  }

  return projectedResponse;
}

// Only visit documented transcript slots; arbitrary user metadata stays opaque.
export function projectTranscriptMetadata<T>(
  metadata: T,
  options: {
    stripPrompt: boolean;
    stripOutput: boolean;
    stripVars: boolean;
    stripGrading: boolean;
  },
  testMetadata?: AtomicTestCase['metadata'],
): T {
  const record = asRecord(metadata);
  if (
    !record ||
    (!options.stripPrompt && !options.stripOutput && !options.stripVars && !options.stripGrading)
  ) {
    return metadata;
  }
  const projected = { ...record };
  if (options.stripPrompt) {
    delete projected.redteamFinalPrompt;
  }
  if (options.stripOutput) {
    for (const key of ['toolCalls', 'skillCalls', 'structuredOutput', 'permissionDenials']) {
      delete projected[key];
    }
  }
  if (options.stripVars) {
    delete projected.transformDisplayVars;
  }
  if (options.stripGrading) {
    delete projected.storedGraderResult;
  }
  const projectHistoryEntry = (entry: unknown, stripVars = false) => {
    const record = asRecord(entry);
    if (!record) {
      return entry;
    }
    const history = { ...record };
    if (options.stripPrompt) {
      delete history.prompt;
      delete history.promptAudio;
      delete history.promptImage;
    }
    if (options.stripOutput) {
      delete history.output;
      delete history.outputAudio;
      delete history.outputImage;
    }
    // Iterative-image's user turns combine the image output description with
    // the next input. Its system turn contains only the input instructions.
    if (
      ((options.stripPrompt || options.stripOutput) &&
        (history.role === 'user' || history.role === 'assistant')) ||
      (options.stripPrompt && history.role === 'system')
    ) {
      delete history.content;
    }
    if (stripVars) {
      delete history.inputVars;
    }
    return history;
  };
  if (
    (options.stripPrompt || options.stripOutput || options.stripVars) &&
    Array.isArray(record.redteamHistory)
  ) {
    projected.redteamHistory = record.redteamHistory.map((entry) =>
      projectHistoryEntry(entry, options.stripVars),
    );
  }
  if ((options.stripPrompt || options.stripOutput) && Array.isArray(record.redteamTreeHistory)) {
    projected.redteamTreeHistory = record.redteamTreeHistory.map((entry) =>
      projectHistoryEntry(entry),
    );
  }
  if (options.stripPrompt || options.stripOutput) {
    if (Array.isArray(record.messages)) {
      projected.messages = record.messages.map((message) => {
        if (!asRecord(message)) {
          return message;
        }
        // Iterative-tree stores TreeSearchOutput nodes here as well as in
        // redteamTreeHistory. These structural fields survive prior stripping.
        if (
          !('role' in message) &&
          typeof message.id === 'string' &&
          typeof message.depth === 'number' &&
          typeof message.wasSelected === 'boolean'
        ) {
          return projectHistoryEntry(message);
        }
        // Stateless providers reuse the full conversation as input. Assistant
        // turns in this transcript are therefore both prompt and output copies.
        if (options.stripPrompt || message.role === 'assistant') {
          const { content: _content, ...rest } = message;
          return rest;
        }
        return message;
      });
    }
    for (const key of ['successfulAttacks', 'successfulTurns']) {
      const entries = record[key];
      if (!Array.isArray(entries)) {
        continue;
      }
      projected[key] = entries.map((entry) => {
        if (!asRecord(entry)) {
          return entry;
        }
        const attack = { ...entry };
        if (options.stripPrompt) {
          delete attack.prompt;
          if (key === 'successfulAttacks') {
            delete attack.message;
          }
        }
        if (options.stripOutput) {
          delete attack.response;
        }
        return attack;
      });
    }
    if (Array.isArray(record.audioHistory)) {
      projected.audioHistory = record.audioHistory.map((entry) => {
        if (!asRecord(entry)) {
          return entry;
        }
        const turn = { ...entry };
        if (options.stripPrompt) {
          delete turn.textPrompt;
        }
        if (options.stripOutput) {
          delete turn.responseTranscript;
        }
        return turn;
      });
    }
  }
  const userMetadata = asRecord(testMetadata);
  if (userMetadata) {
    for (const [key, value] of Object.entries(record)) {
      if (
        Object.prototype.hasOwnProperty.call(userMetadata, key) &&
        isDeepStrictEqual(value, userMetadata[key])
      ) {
        projected[key] = value;
      }
    }
  }
  return projected as T;
}

// Grading projection follows the schema, not arbitrary assertion/output objects.
export function projectGradingResult<T>(
  gradingResult: T,
  stripMetadata: boolean,
  stripPrompt: boolean,
  depth = 0,
): T {
  const record = asRecord(gradingResult);
  if ((!stripMetadata && !stripPrompt) || !record) {
    return gradingResult;
  }
  if (depth > OUTPUT_SANITIZE_MAX_DEPTH) {
    return REDACTED as T;
  }
  const projected = { ...record };
  if (stripMetadata) {
    delete projected.metadata;
  }
  if (stripPrompt && 'assertion' in projected) {
    projected.assertion = stripAssertionRubricPrompts(
      stripTestProviderPromptSelectors(projected.assertion),
    );
  }
  const tokensUsed = record.tokensUsed as GradingResult['tokensUsed'];
  const cachedResponse = asRecord(record.metadata)?.cachedResponse;
  if (stripMetadata && typeof cachedResponse === 'boolean' && !tokensUsed?.incurredTokenUsage) {
    const usage = createEmptyTokenUsage();
    accumulateGradingTokenUsage(usage, tokensUsed, { cached: cachedResponse });
    projected.tokensUsed = {
      ...tokensUsed,
      ...usage.assertions,
      incurredTokenUsage: usage.incurredTokenUsage?.assertions ?? usage.assertions,
    };
  }
  if (Array.isArray(record.componentResults)) {
    projected.componentResults = record.componentResults.map((component) =>
      projectGradingResult(component, stripMetadata, stripPrompt, depth + 1),
    );
  }
  return projected as T;
}

export function projectPrompt<T extends Prompt>(prompt: T, stripPromptText: boolean): T {
  if (!stripPromptText) {
    return prompt;
  }
  // Older imported rows may carry a primitive prompt with a valid promptId.
  const record = asRecord(prompt) ?? {};
  const config = asRecord(record.config);
  const projectedConfig = config ? { ...config } : undefined;
  if (projectedConfig) {
    if (projectedConfig.provider) {
      projectedConfig.provider = stripProviderPromptSelectors(projectedConfig.provider);
    }
    delete projectedConfig.prefix;
    delete projectedConfig.suffix;
    delete projectedConfig.rubricPrompt;
  }
  return {
    ...record,
    ...(projectedConfig && { config: projectedConfig }),
    ...('display' in record ? { display: '[prompt stripped]' } : {}),
    ...('template' in record ? { template: '[prompt stripped]' } : {}),
    label: '[prompt stripped]',
    raw: '[prompt stripped]',
  } as T;
}

export function sanitizePromptForArtifact<T extends Prompt>(
  prompt: T,
  stripFlags = getStripFlags(),
): T {
  const stripPromptText = stripFlags.shouldStripPromptText;
  if (!asRecord(prompt)) {
    return (typeof prompt === 'string' && stripPromptText ? '[prompt stripped]' : prompt) as T;
  }
  const sanitized = sanitizeForDbWithSecrets(prompt, true);
  const id = Object.getOwnPropertyDescriptor(prompt, 'id')?.value;
  let generatedId = typeof id === 'string' && /^[a-f0-9]{64}$/i.test(id) ? id : undefined;
  // Imported completed prompts can lack IDs. Preserve their identity before stripping labels.
  if (
    id === undefined &&
    stripPromptText &&
    typeof Object.getOwnPropertyDescriptor(prompt, 'provider')?.value === 'string'
  ) {
    const label = Object.getOwnPropertyDescriptor(prompt, 'label')?.value;
    const raw = Object.getOwnPropertyDescriptor(prompt, 'raw')?.value;
    if (typeof label === 'string' && typeof raw === 'string') {
      generatedId = generateIdFromPrompt({ label, raw });
    }
  }
  if (!asRecord(sanitized)) {
    return projectPrompt(
      { raw: REDACTED, label: REDACTED, ...(generatedId && { id: generatedId }) } as T,
      stripPromptText,
    );
  }
  if ('config' in sanitized) {
    const descriptor = Object.getOwnPropertyDescriptor(prompt, 'config');
    const config = descriptor && 'value' in descriptor ? descriptor.value : sanitized.config;
    sanitized.config = sanitizeConfigForOutput(config, stripFlags);
  }
  const metrics = asRecord(asRecord(prompt)?.metrics);
  const sanitizedMetrics = asRecord(asRecord(sanitized)?.metrics);
  if (metrics && sanitizedMetrics) {
    // Custom metric names may be credential-shaped, but these schema-defined
    // maps contain numeric aggregates. JSON normalizes nonfinite numbers to null;
    // preserve those nulls on re-export too. Keep other values under redaction.
    for (const key of ['namedScores', 'namedScoresCount', 'namedScoreWeights']) {
      const values = asRecord(metrics[key]);
      if (values) {
        const numericValues = Object.fromEntries(
          Object.entries(values).filter(([, value]) => typeof value === 'number' || value === null),
        );
        sanitizedMetrics[key] = {
          ...asRecord(sanitizedMetrics[key]),
          ...sanitizeForDb(numericValues),
        };
      }
    }
  }
  // Generated prompt identities are SHA-256 hashes, which otherwise match the
  // generic secret-value heuristic. Other IDs still undergo normal redaction.
  if (generatedId) {
    sanitized.id = generatedId;
  }
  return projectPrompt(sanitized, stripPromptText);
}

export function projectTestCase(
  testCase: AtomicTestCase,
  options: {
    stripMetadata: boolean;
    stripVars: boolean;
    stripPrompt: boolean;
    stripOutput: boolean;
  },
): AtomicTestCase {
  if (
    !asRecord(testCase) ||
    (!options.stripMetadata && !options.stripVars && !options.stripPrompt && !options.stripOutput)
  ) {
    return testCase;
  }

  const projectedTestCase: AtomicTestCase = options.stripMetadata
    ? (({ metadata: _metadata, ...rest }) => rest)(testCase)
    : { ...testCase };

  if (options.stripVars) {
    projectedTestCase.vars = undefined;
  }
  if (options.stripPrompt && Array.isArray(testCase.prompts)) {
    projectedTestCase.prompts = testCase.prompts.map((prompt) =>
      typeof prompt === 'string' ? '[prompt stripped]' : prompt,
    );
  }
  if (options.stripPrompt && testCase.options && asRecord(testCase.options)) {
    const {
      prefix: _prefix,
      suffix: _suffix,
      rubricPrompt: _rubricPrompt,
      ...rest
    } = testCase.options;
    projectedTestCase.options = rest;
  }
  if (options.stripPrompt && Array.isArray(testCase.assert)) {
    projectedTestCase.assert = testCase.assert.map((assertion) =>
      stripAssertionRubricPrompts(assertion),
    );
  }

  if (options.stripOutput) {
    delete projectedTestCase.providerOutput;
  }
  if (options.stripMetadata && testCase.metadata?.__promptfoo?.remote === true) {
    projectedTestCase.metadata = { __promptfoo: { remote: true } };
  }

  return options.stripPrompt
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

// Removes circular references from the provider object and ensures consistent format
export function sanitizeProvider(
  provider: ApiProvider | ProviderOptions | string,
  throwOnError = false,
): ProviderOptions {
  try {
    if (typeof provider === 'object' && provider) {
      const id = typeof provider.id === 'function' ? provider.id() : provider.id;
      return {
        id: throwOnError ? sanitizeForDbWithSecrets(id, true) : id,
        label: throwOnError ? sanitizeForDbWithSecrets(provider.label, true) : provider.label,
        ...(provider.config && {
          config: sanitizeProviderConfig(provider.config, throwOnError),
        }),
      };
    }
  } catch {
    if (throwOnError) {
      return { id: '[provider unavailable]' };
    }
  }
  return JSON.parse(
    safeJsonStringify(throwOnError ? sanitizeForDbWithSecrets(provider, true) : provider) as string,
  );
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
export function sanitizeForDbWithSecrets<T>(obj: T, artifact = false): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  try {
    return sanitizeObject(obj, {
      context: 'evalResult field',
      throwOnError: artifact,
      sanitizeUrls: artifact,
      maxDepth: artifact ? OUTPUT_SANITIZE_MAX_DEPTH : Number.POSITIVE_INFINITY,
    }) as T;
  } catch {
    return REDACTED as T;
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
  if (isSecretField(headerName) || SENSITIVE_RESPONSE_HEADER_NAMES.has(normalized)) {
    return true;
  }
  return SENSITIVE_RESPONSE_HEADER_PREFIXES.some((prefix) => normalized.startsWith(prefix));
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
  const sourceEntries = Object.entries(sourceHeaders);
  for (const [key, value] of Object.entries(headers)) {
    if (
      isSensitiveHeader(key) &&
      sourceEntries.some(
        ([sourceKey, sourceValue]) =>
          sourceKey.toLowerCase() === key.toLowerCase() && isDeepStrictEqual(sourceValue, value),
      )
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
    const redacted = redactSensitiveHeaders(
      legacyHeaders as Record<string, unknown>,
      legacyHeadersSource as Record<string, unknown>,
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
      const redacted = redactSensitiveHeaders(slotValue as Record<string, unknown>);
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
  if (!asRecord(response)) {
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

function sanitizeGradingResultAssertions<T>(
  gradingResult: T,
  maxDepth = Number.POSITIVE_INFINITY,
  depth = 0,
): T {
  if (!gradingResult || typeof gradingResult !== 'object' || Array.isArray(gradingResult)) {
    return gradingResult;
  }

  if (depth > maxDepth) {
    return REDACTED as T;
  }
  const gr = gradingResult as Record<string, unknown>;
  const assertion = asRecord(gr.assertion);
  const sanitizedAssertion = assertion && { ...assertion };
  if (sanitizedAssertion) {
    for (const field of ['provider', 'config']) {
      if (Object.prototype.hasOwnProperty.call(sanitizedAssertion, field)) {
        sanitizedAssertion[field] = sanitizeObject(sanitizedAssertion[field], {
          context: 'grading assertion',
          maxDepth: maxDepth - depth,
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
      componentResults: gr.componentResults.map((component) =>
        sanitizeGradingResultAssertions(component, maxDepth, depth + 1),
      ),
    }),
  } as T;
}

export function sanitizeGradingResultForDb<T>(gradingResult: T, artifact = false): T {
  return redactHttpHeadersOnGradingResult(
    sanitizeGradingResultAssertions(
      gradingResult,
      artifact ? OUTPUT_SANITIZE_MAX_DEPTH : Number.POSITIVE_INFINITY,
    ),
  );
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
>(
  fields: {
    response: R;
    gradingResult: G;
    metadata: M;
  },
  artifact = false,
): {
  response: R;
  gradingResult: G;
  metadata: M;
} {
  return {
    response: sanitizeResponseForDb(fields.response),
    gradingResult: sanitizeGradingResultForDb(fields.gradingResult, artifact),
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

export type OutputStripFlags = ReturnType<typeof getStripFlags>;

const TRACE_OUTPUT_ATTRIBUTE_KEYS = [
  PromptfooAttributes.RESPONSE_BODY,
  ...TOOL_ARGUMENT_ATTRIBUTE_KEYS,
  ...COMMAND_ATTRIBUTE_KEYS,
  ...SEARCH_ATTRIBUTE_KEYS,
  'tool.output',
  'tool.result',
  'gen_ai.tool.call.result',
  'braintrust.output',
  'langfuse.output',
  'ai.toolCall.result',
  'codex.output',
  'codex.command.output',
  'codex.message',
  'codex.message.text',
  'codex.reasoning',
  'codex.reasoning.text',
  'codex.reasoning.summary',
  'otel.log.body',
] as const;

export function projectTracesForOutput(traces: TraceData[], stripFlags = getStripFlags()) {
  const {
    shouldStripMetadata,
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
  } = stripFlags;

  const omitted = [
    ...(shouldStripPromptText
      ? [
          PromptfooAttributes.REQUEST_BODY,
          PromptfooAttributes.PROMPT_LABEL,
          'braintrust.input',
          'langfuse.input',
        ]
      : []),
    ...(shouldStripResponseOutput ? TRACE_OUTPUT_ATTRIBUTE_KEYS : []),
    ...(stripFlags.shouldStripGradingResult ? [GenAIAttributes.EVALUATION_EXPLANATION] : []),
  ];
  const projectAttributes = (attributes: Record<string, unknown> | undefined) => {
    if (!asRecord(attributes)) {
      return attributes;
    }
    const projected = { ...attributes };
    for (const key of omitted) {
      delete projected[key];
    }
    return Object.keys(projected).length ? projected : undefined;
  };

  return traces.map((trace) => {
    const projected = { ...trace };
    const { metadata } = trace;
    delete projected.metadata;
    if (metadata !== undefined && !shouldStripMetadata) {
      if (shouldStripTestVars && asRecord(metadata) && 'vars' in metadata) {
        const { vars: _vars, ...rest } = metadata;
        if (Object.keys(rest).length) {
          projected.metadata = sanitizeForDbWithSecrets(rest, true);
        }
      } else {
        projected.metadata = sanitizeForDbWithSecrets(metadata, true);
      }
    }
    if (!omitted.length) {
      return projected;
    }
    return {
      ...projected,
      spans: projected.spans.map((span) => {
        let name = span.name;
        const attributes = asRecord(span.attributes);
        if (shouldStripResponseOutput && typeof name === 'string' && attributes) {
          if (COMMAND_ATTRIBUTE_KEYS.some((key) => key in attributes) && name.startsWith('exec ')) {
            name = 'exec [output stripped]';
          } else if (
            SEARCH_ATTRIBUTE_KEYS.some((key) => key in attributes) &&
            name.startsWith('search "')
          ) {
            name = 'search "[output stripped]"';
          } else if (name === attributes['otel.log.body']) {
            name = '[output stripped]';
          }
        }
        const events = asRecord(span)?.events;
        const projectedSpan = {
          ...span,
          ...(typeof name === 'string' && { name }),
          attributes: projectAttributes(span.attributes),
          ...(Array.isArray(events) && {
            events: events.map((event) => {
              const record = asRecord(event);
              return record
                ? { ...record, attributes: projectAttributes(asRecord(record.attributes)) }
                : event;
            }),
          }),
        };
        if (shouldStripResponseOutput) {
          delete projectedSpan.statusMessage;
          const legacyStatus = asRecord(asRecord(span)?.status);
          if (legacyStatus) {
            const { message: _message, ...status } = legacyStatus;
            return { ...projectedSpan, status };
          }
        }
        return projectedSpan;
      }),
    };
  });
}

// Project a summary before it is serialized to a file artifact (json/yaml/txt/html/xml). For
// non-persisted evals the in-memory results are not redacted at the DB / JSONL boundary, and
// legacy V2 summaries also carry a denormalized table with its own copies of result data.
export function sanitizeSummaryForArtifact<T extends EvaluateSummaryV2 | EvaluateSummaryV3>(
  summary: T,
  stripFlags: OutputStripFlags,
): T {
  return {
    ...summary,
    ...(Array.isArray(summary.results) && {
      results: summary.results.map((result) => sanitizeResultForJsonlArtifact(result, stripFlags)),
    }),
    ...('prompts' in summary &&
      Array.isArray(summary.prompts) && {
        prompts: summary.prompts.map((prompt) => sanitizePromptForArtifact(prompt, stripFlags)),
      }),
    ...('table' in summary &&
      summary.table && {
        table: sanitizeTableForArtifact(summary.table, stripFlags),
      }),
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
  if (!asRecord(result)) {
    return result;
  }
  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  } = stripFlags;

  const artifactResult = serializeResultProviderRefs(result) as T & Record<string, unknown>;
  const redacted = redactSensitiveResultFieldsForDb(
    {
      response: sanitizeForDb(artifactResult.response as ProviderResponse | null | undefined),
      gradingResult: sanitizeForDb(artifactResult.gradingResult),
      metadata: sanitizeForDb(artifactResult.metadata),
    },
    true,
  );
  const response = projectProviderResponse(redacted.response ?? undefined, {
    stripMetadata: shouldStripMetadata,
    stripOutput: shouldStripResponseOutput,
    stripPrompt: shouldStripPromptText,
    stripVars: shouldStripTestVars,
    stripGrading: shouldStripGradingResult,
  });

  return {
    ...result,
    ...(artifactResult.testCase
      ? {
          testCase: projectTestCase(
            sanitizeForDbWithSecrets(artifactResult.testCase as AtomicTestCase, true),
            {
              stripMetadata: shouldStripMetadata,
              stripVars: shouldStripTestVars,
              stripPrompt: shouldStripPromptText,
              stripOutput: shouldStripResponseOutput,
            },
          ),
        }
      : {}),
    ...(artifactResult.vars === undefined
      ? {}
      : {
          vars: shouldStripTestVars ? {} : sanitizeForDbWithSecrets(artifactResult.vars, true),
        }),
    ...(artifactResult.prompt
      ? {
          prompt: sanitizePromptForArtifact(artifactResult.prompt as Prompt, stripFlags),
        }
      : {}),
    ...(artifactResult.provider
      ? {
          provider: sanitizeProvider(
            artifactResult.provider as ApiProvider | ProviderOptions | string,
            true,
          ),
        }
      : {}),
    response,
    gradingResult: shouldStripGradingResult
      ? null
      : projectGradingResult(redacted.gradingResult, shouldStripMetadata, shouldStripPromptText),
    namedScores: sanitizeForDb(artifactResult.namedScores),
    metadata: shouldStripMetadata
      ? {}
      : projectTranscriptMetadata(
          projectOutputMetadata(
            redacted.metadata,
            shouldStripResponseOutput,
            redacted.response?.metadata,
            (artifactResult.testCase as AtomicTestCase | undefined)?.metadata,
          ),
          {
            stripPrompt: shouldStripPromptText,
            stripOutput: shouldStripResponseOutput,
            stripVars: shouldStripTestVars,
            stripGrading: shouldStripGradingResult,
          },
          (artifactResult.testCase as AtomicTestCase | undefined)?.metadata,
        ),
  } as T;
}

/**
 * Sanitize the denormalized visualization `table` carried by a legacy (V2) summary or rendered
 * into an HTML artifact. The table mirrors result data across its head prompts, row display vars,
 * and output cells, so every copy must honor the same credential redaction and
 * `PROMPTFOO_STRIP_*` projections as `summary.results`. Non-mutating: returns a projected copy,
 * leaving in-memory rows real for hooks.
 */
export function sanitizeTableForArtifact(
  table: EvaluateTable,
  stripFlags = getStripFlags(),
): EvaluateTable {
  if (!asRecord(table)) {
    return table;
  }

  const artifactTable = table as unknown as Omit<EvaluateTable, 'head'> & {
    head?: Partial<EvaluateTable['head']>;
  };
  const tableHead =
    typeof artifactTable.head === 'object' && artifactTable.head !== null
      ? artifactTable.head
      : undefined;
  const headPrompts = Array.isArray(tableHead?.prompts) ? tableHead.prompts : undefined;
  const headVars = Array.isArray(tableHead?.vars) ? tableHead.vars : [];

  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripGradingResult,
    shouldStripMetadata,
    shouldStripTestVars,
  } = stripFlags;

  const sanitizeTestCase = (testCase: AtomicTestCase | undefined) =>
    testCase
      ? projectTestCase(sanitizeForDbWithSecrets(testCase, true), {
          stripMetadata: shouldStripMetadata,
          stripVars: shouldStripTestVars,
          stripPrompt: shouldStripPromptText,
          stripOutput: shouldStripResponseOutput,
        })
      : testCase;

  const stringifyDisplayVar = (value: unknown): string =>
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '');

  const sanitizeDisplayVars = (vars: string[], testCase: AtomicTestCase | undefined): string[] => {
    if (shouldStripTestVars) {
      return vars.map(() => '');
    }
    return vars.map((value, index) => {
      const varName = headVars[index];
      if (varName === undefined) {
        return sanitizeForDbWithSecrets(value, true);
      }
      const rawValue = testCase?.vars?.[varName];
      if (rawValue !== undefined) {
        const sanitizedRawValue = sanitizeForDbWithSecrets({ [varName]: rawValue }, true)[varName];
        if (!isDeepStrictEqual(rawValue, sanitizedRawValue)) {
          return stringifyDisplayVar(sanitizedRawValue);
        }
      }
      return sanitizeForDbWithSecrets({ [varName]: value }, true)[varName];
    });
  };

  const sanitizeOutput = (
    output: EvaluateTableOutput | null | undefined,
  ): EvaluateTableOutput | null | undefined => {
    if (output == null || !asRecord(output)) {
      return output;
    }

    const artifactOutput = output as EvaluateTableOutput & Record<string, unknown>;
    const projectedOutput = { ...artifactOutput };
    if (shouldStripResponseOutput) {
      delete projectedOutput.audio;
      delete projectedOutput.images;
      delete projectedOutput.video;
    }
    const redacted = redactSensitiveResultFieldsForDb(
      {
        response: sanitizeForDb(output.response),
        gradingResult: sanitizeForDb(output.gradingResult),
        metadata: sanitizeForDb(output.metadata),
      },
      true,
    );
    return {
      ...projectedOutput,
      ...(artifactOutput.vars === undefined
        ? {}
        : {
            vars: shouldStripTestVars ? {} : sanitizeForDbWithSecrets(artifactOutput.vars, true),
          }),
      prompt: shouldStripPromptText ? '[prompt stripped]' : output.prompt,
      text: shouldStripResponseOutput ? '[output stripped]' : output.text,
      response: projectProviderResponse(redacted.response ?? undefined, {
        stripMetadata: shouldStripMetadata,
        stripOutput: shouldStripResponseOutput,
        stripPrompt: shouldStripPromptText,
        stripVars: shouldStripTestVars,
        stripGrading: shouldStripGradingResult,
      }),
      gradingResult: shouldStripGradingResult
        ? null
        : projectGradingResult(redacted.gradingResult, shouldStripMetadata, shouldStripPromptText),
      metadata: shouldStripMetadata
        ? {}
        : projectTranscriptMetadata(
            projectOutputMetadata(
              redacted.metadata,
              shouldStripResponseOutput,
              redacted.response?.metadata,
              output.testCase?.metadata,
            ),
            {
              stripPrompt: shouldStripPromptText,
              stripOutput: shouldStripResponseOutput,
              stripVars: shouldStripTestVars,
              stripGrading: shouldStripGradingResult,
            },
            output.testCase?.metadata,
          ),
      testCase: sanitizeTestCase(output.testCase) as AtomicTestCase,
    } as EvaluateTableOutput;
  };

  return {
    ...artifactTable,
    ...(tableHead
      ? {
          head: {
            ...tableHead,
            ...(headPrompts
              ? {
                  prompts: headPrompts.map((prompt) =>
                    sanitizePromptForArtifact(prompt, stripFlags),
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(Array.isArray(table.body)
      ? {
          body: table.body.map((row) =>
            asRecord(row)
              ? {
                  ...row,
                  vars: Array.isArray(row.vars)
                    ? sanitizeDisplayVars(row.vars, row.test)
                    : row.vars,
                  test: sanitizeTestCase(row.test) as AtomicTestCase,
                  outputs: Array.isArray(row.outputs)
                    ? (row.outputs.map(sanitizeOutput) as EvaluateTableOutput[])
                    : row.outputs,
                }
              : row,
          ),
        }
      : {}),
  } as EvaluateTable;
}
