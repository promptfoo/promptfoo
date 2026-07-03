import { isDeepStrictEqual } from 'node:util';

import { and, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import { extractAndStoreBinaryData, isBlobStorageEnabled } from '../blobs/extractor';
import { getDb } from '../database/index';
import { evalResultsTable } from '../database/tables';
import { getEnvBool } from '../envars';
import logger from '../logger';
import { hashPrompt } from '../prompts/utils';
import { ProviderConfig } from '../providers/shared';
import { PromptfooAttributes, TOOL_ARGUMENT_ATTRIBUTE_KEYS } from '../tracing/genaiTracer';
import {
  type ApiProvider,
  type AtomicTestCase,
  type EvaluateResult,
  type EvaluateTable,
  type EvaluateTableOutput,
  type GradingResult,
  isResultFailureReason,
  type Prompt,
  type ProviderOptions,
  type ProviderResponse,
  ResultFailureReason,
  type TraceData,
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

function sanitizeProviderConfig(config: ProviderConfig): ProviderConfig {
  return sanitizeObject(JSON.parse(safeJsonStringify(config) as string), {
    context: 'provider config',
    maxDepth: Number.POSITIVE_INFINITY,
  }) as ProviderConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface OutputStripFlags {
  shouldStripPromptText: boolean;
  shouldStripResponseOutput: boolean;
  shouldStripTestVars: boolean;
  shouldStripGradingResult: boolean;
  shouldStripMetadata: boolean;
}

function hasAnyStripFlag(flags: OutputStripFlags): boolean {
  return Object.values(flags).some(Boolean);
}

const TRACE_PROMPT_TEXT_ATTRIBUTE_KEYS = [
  PromptfooAttributes.PROMPT_LABEL,
  PromptfooAttributes.REQUEST_BODY,
  'tool.output',
  'tool.result',
  'ai.toolCall.result',
  'codex.output',
] as const;

// OTLP log bodies are persisted by the receiver as `otel.log.body` and can carry
// deep-agent tool results and message/API content. Treat them as response output so
// the strip guarantee covers logs the same way it covers response bodies.
const OTEL_LOG_BODY_ATTRIBUTE_KEY = 'otel.log.body';

const TRACE_RESPONSE_OUTPUT_ATTRIBUTE_KEYS = [
  PromptfooAttributes.RESPONSE_BODY,
  ...TOOL_ARGUMENT_ATTRIBUTE_KEYS,
  'codex.command',
  'codex.search.query',
  'codex.message',
  'codex.reasoning',
  'codex.reasoning.summary',
  OTEL_LOG_BODY_ATTRIBUTE_KEY,
] as const;

function projectTraceSpanErrorDetails(span: TraceData['spans'][number]) {
  const runtimeSpan = span as typeof span & {
    status?: Record<string, unknown>;
  };
  return {
    ...runtimeSpan,
    ...(typeof runtimeSpan.statusMessage === 'string' && {
      statusMessage: '[error details stripped]',
    }),
    ...(isRecord(runtimeSpan.status) &&
      typeof runtimeSpan.status.message === 'string' && {
        status: {
          ...runtimeSpan.status,
          message: '[error details stripped]',
        },
      }),
  };
}

function projectTraceSpanName(
  span: TraceData['spans'][number],
  shouldStripResponseOutput: boolean,
): string {
  if (!shouldStripResponseOutput || !span.attributes) {
    return span.name;
  }
  if (
    typeof span.attributes['codex.search.query'] === 'string' &&
    span.name.startsWith('search "')
  ) {
    return 'search "[output stripped]"';
  }
  if (typeof span.attributes['codex.command'] === 'string' && span.name.startsWith('exec ')) {
    return 'exec [output stripped]';
  }
  // A log-derived span with no event name echoes the (short) log body into the span
  // name. Once the body attribute is stripped, mask the name too so the secret does
  // not survive in the name field.
  const logBody = span.attributes[OTEL_LOG_BODY_ATTRIBUTE_KEY];
  if (typeof logBody === 'string' && span.name === logBody) {
    return '[output stripped]';
  }
  return span.name;
}

export function projectErrorForOutput(
  error: EvaluateResult['error'],
  stripFlags: OutputStripFlags,
): EvaluateResult['error'] {
  return error && hasAnyStripFlag(stripFlags) ? '[error details stripped]' : error;
}

// Compact redteam-report history is embedded in the report summary that the browser
// loads eagerly, so a chatty or adversarial run can otherwise reintroduce the OOM this
// projection exists to prevent. Bound per-turn text and media: text is truncated, and
// media larger than the inline budget is dropped from the summary (it stays available
// through full row-detail hydration). Keep the SQL projection in `eval.ts`
// (`jsonHistoryForRedteamReport`) in sync with these limits.
export const MAX_COMPACT_HISTORY_TEXT_LENGTH = 10_240;
export const MAX_COMPACT_HISTORY_MEDIA_LENGTH = 65_536;

// Require history prompt/output to be strings (never nested objects): the report UI
// renders them as React children and throws on non-string content.
function boundHistoryText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.length > MAX_COMPACT_HISTORY_TEXT_LENGTH
    ? value.slice(0, MAX_COMPACT_HISTORY_TEXT_LENGTH)
    : value;
}

function boundHistoryMedia(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const serialized = safeJsonStringify(value);
  if (typeof serialized !== 'string' || serialized.length > MAX_COMPACT_HISTORY_MEDIA_LENGTH) {
    return undefined;
  }
  return value;
}

function projectRedteamHistoryForOutput(
  history: unknown,
  stripFlags: OutputStripFlags,
  forceProjection = false,
): unknown {
  const shouldProjectHistory =
    forceProjection ||
    stripFlags.shouldStripPromptText ||
    stripFlags.shouldStripResponseOutput ||
    stripFlags.shouldStripTestVars;
  if (!shouldProjectHistory) {
    return history;
  }
  if (!Array.isArray(history)) {
    return undefined;
  }

  return history.filter(isRecord).map((entry) => {
    const boundedPrompt = boundHistoryText(entry.prompt);
    const boundedPromptAudio = boundHistoryMedia(entry.promptAudio);
    const boundedPromptImage = boundHistoryMedia(entry.promptImage);
    const boundedOutput = boundHistoryText(entry.output);
    const boundedOutputAudio = boundHistoryMedia(entry.outputAudio);
    const boundedOutputImage = boundHistoryMedia(entry.outputImage);
    return {
      ...(typeof entry.id === 'string' && { id: entry.id }),
      ...(typeof entry.parentId === 'string' && { parentId: entry.parentId }),
      ...(typeof entry.score === 'number' && { score: entry.score }),
      ...(typeof entry.depth === 'number' && { depth: entry.depth }),
      ...(typeof entry.wasSelected === 'boolean' && { wasSelected: entry.wasSelected }),
      ...(typeof entry.graderPassed === 'boolean' && { graderPassed: entry.graderPassed }),
      ...(entry.role === 'user' || entry.role === 'assistant' || entry.role === 'system'
        ? { role: entry.role }
        : {}),
      ...(stripFlags.shouldStripPromptText
        ? { prompt: '[prompt stripped]' }
        : {
            ...(boundedPrompt !== undefined && { prompt: boundedPrompt }),
            ...(boundedPromptAudio !== undefined && { promptAudio: boundedPromptAudio }),
            ...(boundedPromptImage !== undefined && { promptImage: boundedPromptImage }),
          }),
      ...(stripFlags.shouldStripResponseOutput
        ? { output: '[output stripped]' }
        : {
            ...(boundedOutput !== undefined && { output: boundedOutput }),
            ...(boundedOutputAudio !== undefined && { outputAudio: boundedOutputAudio }),
            ...(boundedOutputImage !== undefined && { outputImage: boundedOutputImage }),
          }),
      ...(!forceProjection &&
        !stripFlags.shouldStripTestVars &&
        entry.inputVars !== undefined && { inputVars: entry.inputVars }),
    };
  });
}

const RESPONSE_OUTPUT_STRIPPED = '[output stripped]';

// First-party agent SDKs (e.g. the Claude Agent SDK) persist complete model-generated
// tool activity under response metadata: `toolCalls` inputs/results, `skillCalls`
// inputs, `structuredOutput`, and `permissionDenials`. These carry commands, file
// contents, and model output, so they must follow the response-output strip policy
// instead of surviving it because they live under `metadata`. Structural fields
// (id/name/is_error/tool_name) are preserved so shape and counts remain inspectable.
function stripAgentCallContent(entry: unknown, contentKeys: readonly string[]): unknown {
  if (!isRecord(entry)) {
    return RESPONSE_OUTPUT_STRIPPED;
  }
  const projected = { ...entry };
  for (const key of contentKeys) {
    if (key in projected) {
      projected[key] = RESPONSE_OUTPUT_STRIPPED;
    }
  }
  return projected;
}

function stripResponseContentMetadata(metadata: Record<string, unknown>): void {
  if ('toolCalls' in metadata) {
    metadata.toolCalls = Array.isArray(metadata.toolCalls)
      ? metadata.toolCalls.map((entry) => stripAgentCallContent(entry, ['input', 'output']))
      : RESPONSE_OUTPUT_STRIPPED;
  }
  if ('skillCalls' in metadata) {
    metadata.skillCalls = Array.isArray(metadata.skillCalls)
      ? metadata.skillCalls.map((entry) => stripAgentCallContent(entry, ['input']))
      : RESPONSE_OUTPUT_STRIPPED;
  }
  if ('permissionDenials' in metadata) {
    metadata.permissionDenials = Array.isArray(metadata.permissionDenials)
      ? metadata.permissionDenials.map((entry) =>
          stripAgentCallContent(entry, ['input', 'tool_input', 'toolInput']),
        )
      : RESPONSE_OUTPUT_STRIPPED;
  }
  if ('structuredOutput' in metadata) {
    metadata.structuredOutput = RESPONSE_OUTPUT_STRIPPED;
  }
}

export function projectMetadataForOutput(
  metadata: Record<string, unknown> | undefined,
  stripFlags: OutputStripFlags,
  forceHistoryProjection = false,
): Record<string, unknown> | undefined {
  if (stripFlags.shouldStripMetadata) {
    return undefined;
  }
  if (!metadata) {
    return metadata;
  }

  const projectedMetadata = { ...metadata };
  if (stripFlags.shouldStripPromptText) {
    delete projectedMetadata.redteamFinalPrompt;
    delete projectedMetadata.__promptfooMaterializedMultiInputPrompt;
    delete projectedMetadata.inputMaterialization;
  }
  if (stripFlags.shouldStripTestVars) {
    delete projectedMetadata.inputVars;
    delete projectedMetadata.transformDisplayVars;
    delete projectedMetadata.__promptfooMaterializedMultiInputPrompt;
    delete projectedMetadata.inputMaterialization;
  }
  if (stripFlags.shouldStripResponseOutput) {
    stripResponseContentMetadata(projectedMetadata);
  }
  for (const historyKey of ['redteamHistory', 'redteamTreeHistory'] as const) {
    if (historyKey in projectedMetadata) {
      const projectedHistory = projectRedteamHistoryForOutput(
        projectedMetadata[historyKey],
        stripFlags,
        forceHistoryProjection,
      );
      if (projectedHistory === undefined) {
        delete projectedMetadata[historyKey];
      } else {
        projectedMetadata[historyKey] = projectedHistory;
      }
    }
  }

  return Object.keys(projectedMetadata).length > 0 ? projectedMetadata : undefined;
}

function projectProviderResponse(
  response: ProviderResponse | undefined,
  stripFlags: OutputStripFlags,
): ProviderResponse | undefined {
  if (response === undefined || response === null) {
    return response;
  }

  if (!hasAnyStripFlag(stripFlags)) {
    return response;
  }

  if (!isRecord(response)) {
    return stripFlags.shouldStripResponseOutput ? { output: '[output stripped]' } : undefined;
  }

  const projectedResponse: ProviderResponse = { ...response };
  if (projectedResponse.error !== undefined) {
    projectedResponse.error =
      projectErrorForOutput(projectedResponse.error, stripFlags) ?? undefined;
  }
  const metadata = projectMetadataForOutput(
    response.metadata as Record<string, unknown> | undefined,
    stripFlags,
  );
  if (metadata) {
    projectedResponse.metadata = metadata;
  } else {
    delete projectedResponse.metadata;
  }

  if (stripFlags.shouldStripPromptText) {
    delete projectedResponse.prompt;
    delete projectedResponse.inputMaterialization;
  }

  if (stripFlags.shouldStripTestVars) {
    delete projectedResponse.materializedVars;
    delete projectedResponse.inputMaterialization;
  }

  if (stripFlags.shouldStripResponseOutput) {
    projectedResponse.output = '[output stripped]';
    delete projectedResponse.raw;
    delete projectedResponse.providerTransformedOutput;
    delete projectedResponse.audio;
    delete projectedResponse.images;
    delete projectedResponse.video;
  }

  return projectedResponse;
}

export function projectPromptForOutput<T extends Prompt>(prompt: T, stripPromptText: boolean): T {
  if (!stripPromptText) {
    return prompt;
  }

  if (!isRecord(prompt)) {
    return { raw: '[prompt stripped]', label: '[prompt stripped]' } as T;
  }

  const { config: _config, function: _function, template: _template, ...projectedPrompt } = prompt;
  return {
    ...projectedPrompt,
    raw: '[prompt stripped]',
    label: '[prompt stripped]',
    ...(prompt.display !== undefined && { display: '[prompt stripped]' }),
  } as T;
}

function isHashablePrompt(prompt: unknown): prompt is Prompt {
  return (
    isRecord(prompt) &&
    ((typeof prompt.label === 'string' && prompt.label.length > 0) ||
      (typeof prompt.id === 'string' && prompt.id.length > 0) ||
      typeof prompt.raw === 'string' ||
      isRecord(prompt.raw) ||
      Array.isArray(prompt.raw))
  );
}

function projectTestCase<T extends AtomicTestCase | undefined>(
  testCase: T,
  stripFlags: OutputStripFlags,
): T {
  if (!hasAnyStripFlag(stripFlags)) {
    return testCase;
  }
  if (!isRecord(testCase)) {
    return undefined as T;
  }

  const projectedTestCase = { ...testCase };
  const metadata = projectMetadataForOutput(
    testCase.metadata as Record<string, unknown> | undefined,
    stripFlags,
  );
  if (metadata) {
    projectedTestCase.metadata = metadata;
  } else {
    delete projectedTestCase.metadata;
  }

  if (stripFlags.shouldStripTestVars) {
    projectedTestCase.vars = undefined;
  }
  if (stripFlags.shouldStripResponseOutput) {
    delete projectedTestCase.providerOutput;
  }
  if (stripFlags.shouldStripPromptText && isRecord(projectedTestCase.options)) {
    const options = { ...projectedTestCase.options };
    delete options.prefix;
    delete options.suffix;
    if (Object.keys(options).length > 0) {
      projectedTestCase.options = options;
    } else {
      delete projectedTestCase.options;
    }
  }

  return projectedTestCase as T;
}

function projectResultMetadata(
  metadata: EvaluateResult['metadata'],
  stripFlags: OutputStripFlags,
): EvaluateResult['metadata'] {
  if (stripFlags.shouldStripMetadata) {
    return {};
  }
  return projectMetadataForOutput(metadata, stripFlags);
}

const GRADING_RENDERED_PROMPT_KEY = 'renderedGradingPrompt';
const GRADING_RENDERED_ASSERTION_KEY = 'renderedAssertionValue';

// Grading metadata recombines otherwise-stripped inputs: `renderedGradingPrompt` embeds
// the prompt, variables, and response, and `renderedAssertionValue` embeds substituted
// variables (both also under `componentResults`). Keeping the grading result intact
// unless the dedicated grading flag is set would leak that content through every
// content-specific strip flag, so project grading metadata recursively here.
function projectGradingResultForOutput<T>(gradingResult: T, stripFlags: OutputStripFlags): T {
  if (!isRecord(gradingResult)) {
    return gradingResult;
  }
  const removeRenderedPrompt =
    stripFlags.shouldStripPromptText ||
    stripFlags.shouldStripResponseOutput ||
    stripFlags.shouldStripTestVars;
  const removeRenderedAssertion =
    stripFlags.shouldStripPromptText || stripFlags.shouldStripTestVars;
  if (!removeRenderedPrompt && !removeRenderedAssertion && !stripFlags.shouldStripMetadata) {
    return gradingResult;
  }

  const projected: Record<string, unknown> = { ...gradingResult };

  if (isRecord(projected.metadata)) {
    if (stripFlags.shouldStripMetadata) {
      delete projected.metadata;
    } else {
      const gradingMetadata = { ...projected.metadata };
      if (removeRenderedPrompt) {
        delete gradingMetadata[GRADING_RENDERED_PROMPT_KEY];
      }
      if (removeRenderedAssertion) {
        delete gradingMetadata[GRADING_RENDERED_ASSERTION_KEY];
      }
      if (Object.keys(gradingMetadata).length > 0) {
        projected.metadata = gradingMetadata;
      } else {
        delete projected.metadata;
      }
    }
  }

  if (Array.isArray(projected.componentResults)) {
    projected.componentResults = projected.componentResults.map((component) =>
      projectGradingResultForOutput(component, stripFlags),
    );
  }

  return projected as T;
}

export function projectEvaluateResultForOutput(result: EvaluateResult): EvaluateResult {
  const {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  } = getOutputStripFlags();
  const stripFlags = {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  };

  if (
    !shouldStripPromptText &&
    !shouldStripResponseOutput &&
    !shouldStripTestVars &&
    !shouldStripGradingResult &&
    !shouldStripMetadata
  ) {
    return result;
  }

  const prompt = projectPromptForOutput(result.prompt, shouldStripPromptText);
  const testCase = projectTestCase(result.testCase, stripFlags);
  const projectedResult = {
    ...result,
    prompt,
    promptId: shouldStripPromptText
      ? hashPrompt(isHashablePrompt(result.prompt) ? result.prompt : prompt)
      : result.promptId,
    response: projectProviderResponse(result.response, stripFlags),
    testCase,
    gradingResult: shouldStripGradingResult
      ? null
      : projectGradingResultForOutput(result.gradingResult, stripFlags),
    vars: shouldStripTestVars ? {} : result.vars,
    metadata: projectResultMetadata(result.metadata, stripFlags),
    error: projectErrorForOutput(result.error, stripFlags),
  };
  if (testCase === undefined) {
    delete (projectedResult as Partial<EvaluateResult>).testCase;
  }
  return projectedResult;
}

export function projectEvaluateTableForOutput(table: EvaluateTable): EvaluateTable {
  const stripFlags = getOutputStripFlags();
  if (!hasAnyStripFlag(stripFlags)) {
    return table;
  }

  const projectOutput = (output: EvaluateTableOutput): EvaluateTableOutput => {
    const projectedOutput = { ...output };
    if (stripFlags.shouldStripResponseOutput) {
      delete projectedOutput.audio;
      delete projectedOutput.images;
      delete projectedOutput.video;
    }

    const metadata = projectMetadataForOutput(
      output.metadata as Record<string, unknown> | undefined,
      stripFlags,
    );
    const error = projectErrorForOutput(output.error, stripFlags);
    const testCase = projectTestCase(output.testCase, stripFlags);
    const projected = {
      ...projectedOutput,
      prompt: stripFlags.shouldStripPromptText ? '[prompt stripped]' : output.prompt,
      text: stripFlags.shouldStripResponseOutput
        ? '[output stripped]'
        : output.error && error !== output.error
          ? (error ?? '')
          : output.text,
      response: projectProviderResponse(output.response, stripFlags),
      gradingResult: stripFlags.shouldStripGradingResult
        ? null
        : projectGradingResultForOutput(output.gradingResult, stripFlags),
      testCase,
      error,
      metadata,
    };
    if (metadata === undefined) {
      delete projected.metadata;
    }
    if (testCase === undefined) {
      delete (projected as Partial<EvaluateTableOutput>).testCase;
    }
    return projected;
  };

  return {
    ...table,
    head: {
      ...table.head,
      prompts: table.head.prompts.map((prompt) =>
        projectPromptForOutput(prompt, stripFlags.shouldStripPromptText),
      ),
    },
    body: table.body.map((row) => ({
      ...row,
      vars: stripFlags.shouldStripTestVars
        ? Array.isArray(row.vars)
          ? row.vars.map(() => '')
          : []
        : row.vars,
      test: projectTestCase(row.test, stripFlags),
      outputs: row.outputs.map(projectOutput),
    })),
  };
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
export function getOutputStripFlags(): OutputStripFlags {
  return {
    shouldStripPromptText: getEnvBool('PROMPTFOO_STRIP_PROMPT_TEXT', false),
    shouldStripResponseOutput: getEnvBool('PROMPTFOO_STRIP_RESPONSE_OUTPUT', false),
    shouldStripTestVars: getEnvBool('PROMPTFOO_STRIP_TEST_VARS', false),
    shouldStripGradingResult: getEnvBool('PROMPTFOO_STRIP_GRADING_RESULT', false),
    shouldStripMetadata: getEnvBool('PROMPTFOO_STRIP_METADATA', false),
  };
}

export function projectTracesForOutput(traces: TraceData[]): TraceData[] {
  const stripFlags = getOutputStripFlags();
  if (!hasAnyStripFlag(stripFlags)) {
    return traces;
  }

  return traces.map((trace) => {
    let projectedTrace = trace;
    if (stripFlags.shouldStripMetadata) {
      const { metadata: _metadata, ...traceWithoutMetadata } = trace;
      projectedTrace = traceWithoutMetadata;
    } else if (stripFlags.shouldStripTestVars && trace.metadata && 'vars' in trace.metadata) {
      const { metadata: traceMetadata, ...traceWithoutMetadata } = trace;
      const { vars: _vars, ...metadata } = traceMetadata;
      projectedTrace = {
        ...traceWithoutMetadata,
        ...(Object.keys(metadata).length > 0 && { metadata }),
      };
    }

    return {
      ...projectedTrace,
      spans: projectedTrace.spans.map((span) => {
        const projectedSpan = projectTraceSpanErrorDetails(span);
        if (!span.attributes) {
          return projectedSpan;
        }

        const projectedAttributes = { ...span.attributes };
        if ('codex.error' in projectedAttributes) {
          projectedAttributes['codex.error'] = '[error details stripped]';
        }
        if (stripFlags.shouldStripPromptText) {
          for (const key of TRACE_PROMPT_TEXT_ATTRIBUTE_KEYS) {
            delete projectedAttributes[key];
          }
        }
        if (stripFlags.shouldStripResponseOutput) {
          for (const key of TRACE_RESPONSE_OUTPUT_ATTRIBUTE_KEYS) {
            delete projectedAttributes[key];
          }
        }

        const { attributes: _attributes, ...spanWithoutAttributes } = projectedSpan;
        return {
          ...spanWithoutAttributes,
          name: projectTraceSpanName(span, stripFlags.shouldStripResponseOutput),
          ...(Object.keys(projectedAttributes).length > 0 && {
            attributes: projectedAttributes,
          }),
        };
      }),
    };
  });
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
  } = getOutputStripFlags();
  const stripFlags = {
    shouldStripPromptText,
    shouldStripResponseOutput,
    shouldStripTestVars,
    shouldStripGradingResult,
    shouldStripMetadata,
  };

  const artifactResult = result as T & Record<string, unknown>;
  const redacted = redactSensitiveResultFieldsForDb({
    response: sanitizeForDb(artifactResult.response as ProviderResponse | null | undefined),
    gradingResult: sanitizeForDb(artifactResult.gradingResult),
    metadata: sanitizeForDb(artifactResult.metadata),
  });
  const response = projectProviderResponse(redacted.response ?? undefined, stripFlags);
  const metadata = projectResultMetadata(
    redacted.metadata as EvaluateResult['metadata'],
    stripFlags,
  );
  const testCase =
    artifactResult.testCase === undefined
      ? undefined
      : projectTestCase(
          sanitizeForDbWithSecrets(artifactResult.testCase as AtomicTestCase),
          stripFlags,
        );
  const prompt =
    artifactResult.prompt === undefined
      ? undefined
      : projectPromptForOutput(
          sanitizeForDbWithSecrets(artifactResult.prompt as Prompt),
          shouldStripPromptText,
        );

  const projectedResult = {
    ...result,
    ...(testCase === undefined ? {} : { testCase }),
    ...(artifactResult.vars === undefined
      ? {}
      : {
          vars: shouldStripTestVars ? {} : sanitizeForDbWithSecrets(artifactResult.vars),
        }),
    ...(prompt === undefined ? {} : { prompt }),
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
    metadata,
    error: projectErrorForOutput(artifactResult.error as EvaluateResult['error'], stripFlags),
  } as T & Record<string, unknown>;
  if (artifactResult.testCase !== undefined && testCase === undefined) {
    delete projectedResult.testCase;
  }
  return projectedResult as T;
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

  static async findByEvalIdAndIndices(evalId: string, testIdx: number, promptIdx: number) {
    const db = await getDb();
    const result = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          eq(evalResultsTable.testIdx, testIdx),
          eq(evalResultsTable.promptIdx, promptIdx),
        ),
      )
      .limit(1)
      .get();
    return result ? new EvalResult({ ...result, persisted: true }) : null;
  }

  static async findByEvalIdAndResultId(
    evalId: string,
    resultId: string,
    testIdx: number,
    promptIdx: number,
  ) {
    const db = await getDb();
    const result = await db
      .select()
      .from(evalResultsTable)
      .where(
        and(
          eq(evalResultsTable.evalId, evalId),
          eq(evalResultsTable.id, resultId),
          eq(evalResultsTable.testIdx, testIdx),
          eq(evalResultsTable.promptIdx, promptIdx),
        ),
      )
      .limit(1)
      .get();
    return result ? new EvalResult({ ...result, persisted: true }) : null;
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

    return projectEvaluateResultForOutput({
      cost: this.cost,
      description: this.description || undefined,
      error: this.error || undefined,
      gradingResult: this.gradingResult,
      id: this.id,
      latencyMs: this.latencyMs,
      namedScores: this.namedScores,
      prompt: this.prompt,
      promptId: this.promptId,
      promptIdx: this.promptIdx,
      ...(this.traceId ? { traceId: this.traceId } : {}),
      ...(this.evaluationId ? { evaluationId: this.evaluationId } : {}),
      provider: { id: this.provider.id, label: this.provider.label },
      response: this.response,
      score: this.score,
      success: this.success,
      testCase: this.testCase,
      testIdx: this.testIdx,
      tokenUsage,
      vars: this.testCase.vars || {},
      metadata: this.metadata,
      failureReason: this.failureReason,
    });
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
