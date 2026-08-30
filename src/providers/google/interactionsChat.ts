/**
 * Google Gemini chat/text provider built on the Interactions API.
 *
 * The Interactions API went GA in June 2026 and is Google's primary interface
 * for Gemini models and agents; `generateContent` is now the legacy path. This
 * provider maps Promptfoo's Gemini-shaped configuration onto Interactions so
 * existing suites can move transports without rewriting prompts, tools, or
 * assertions.
 *
 * Notable differences from `generateContent`, all verified against the live API:
 * - Input is a flat `input` timeline, not `contents`/`parts`.
 * - Tools are typed entries (`function`, `google_search`, `code_execution`).
 * - Structured output uses `response_format`, which takes a JSON Schema
 *   directly (`{type: 'object', ...}`); there is no `json_schema` wrapper.
 * - `safety_settings` is rejected by the Gemini API on this endpoint.
 * - Interactions are stored server-side by default (55-day paid retention).
 *   Promptfoo defaults to `store: false` so eval payloads are not retained,
 *   and runs the tool loop by resending history inline instead.
 *
 * @see https://ai.google.dev/gemini-api/docs/migrate-to-interactions
 */

import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { sleep } from '../../util/time';
import { getRequestTimeoutMs } from '../shared';
import { GoogleGenericProvider } from './base';
import {
  getInteractionModalityTokenCount,
  getInteractionsEndpoint,
  getLatestTurnSteps,
  getUnexpressibleToolMode,
  getVertexInteractionsEndpoint,
  resolveInteractionsTransport,
} from './interactionsShared';
import {
  calculateGoogleCost,
  createAuthCacheDiscriminator,
  geminiFormatAndSystemInstructions,
  mergeGoogleCompletionOptions,
  parseStringObject,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
} from './util';

import type { CallApiContextParams, ProviderResponse } from '../../types/index';
import type { InteractionResponse, InteractionStep } from './interactionsShared';
import type { CompletionOptions, GoogleProviderConfig, Tool } from './types';

/** Upper bound on server round-trips while resolving `functionToolCallbacks`. */
const DEFAULT_MAX_TOOL_ROUNDS = 8;

type InteractionInputItem = Record<string, unknown>;

/** True for a non-null, non-array object - the shape passthrough blocks must have. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Map a MIME type onto the Interactions content type that carries it. */
function interactionContentTypeForMime(mimeType: string): string {
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }
  if (mimeType.startsWith('image/')) {
    return 'image';
  }
  return 'document';
}

/**
 * Lowercase JSON Schema `type` keywords.
 *
 * Gemini's function declarations use uppercase types (`"OBJECT"`); the
 * Interactions API expects standard lowercase JSON Schema.
 */
function lowercaseSchemaTypes(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(lowercaseSchemaTypes);
  }
  if (!node || typeof node !== 'object') {
    return node;
  }
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>).map(([key, value]) => {
      if (key === 'type' && typeof value === 'string') {
        return [key, value.toLowerCase()];
      }
      if (key === 'type' && Array.isArray(value)) {
        return [
          key,
          value.map((entry) => (typeof entry === 'string' ? entry.toLowerCase() : entry)),
        ];
      }
      return [key, lowercaseSchemaTypes(value)];
    }),
  );
}

/** Convert one Gemini `part` into an Interactions content entry. */
function geminiPartToInteractionContent(part: unknown): Record<string, unknown> | undefined {
  if (!part || typeof part !== 'object') {
    return undefined;
  }
  const typed = part as {
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
    file_data?: { mime_type?: string; file_uri?: string };
  };
  if (typeof typed.text === 'string') {
    return { type: 'text', text: typed.text };
  }

  // Inline data carries bytes, file data carries a URI; both map to the same
  // typed content entry, differing only in that payload field.
  const inline = typed.inlineData ?? typed.inline_data;
  const file = typed.fileData ?? typed.file_data;
  const source = inline ?? file;
  if (!source) {
    return undefined;
  }
  const mimeType =
    (source as { mimeType?: string; mime_type?: string }).mimeType ??
    (source as { mime_type?: string }).mime_type ??
    'application/octet-stream';
  const payload = inline
    ? { data: (inline as { data?: string }).data }
    : { uri: typed.fileData?.fileUri ?? typed.file_data?.file_uri };
  return { type: interactionContentTypeForMime(mimeType), mime_type: mimeType, ...payload };
}

/** Build the `function_result` entry the API threads a tool result back through. */
function toFunctionResult(source: {
  id?: string;
  name?: string;
  response?: unknown;
}): InteractionInputItem {
  const value = source.response ?? source;
  return {
    type: 'function_result',
    ...(source.id ? { call_id: source.id } : {}),
    ...(source.name ? { name: source.name } : {}),
    result: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  };
}

/**
 * Convert Gemini `contents` into the Interactions `input` timeline.
 *
 * A `functionResponse` part becomes a top-level `function_result` entry rather
 * than message content, which is how the API threads tool results back in.
 */
export function geminiContentsToInteractionsInput(contents: unknown): InteractionInputItem[] {
  const list = Array.isArray(contents) ? contents : [contents];
  const input: InteractionInputItem[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { role, parts } = entry as { role?: string; parts?: unknown[] };
    const partList = Array.isArray(parts) ? parts : [];

    const content: Record<string, unknown>[] = [];
    for (const part of partList) {
      const functionResponse = (part as { functionResponse?: any })?.functionResponse;
      if (functionResponse) {
        input.push(toFunctionResult(functionResponse));
        continue;
      }
      const mapped = geminiPartToInteractionContent(part);
      if (mapped) {
        content.push(mapped);
      }
    }

    if (content.length > 0) {
      input.push({
        type: role === 'model' || role === 'assistant' ? 'model_output' : 'user_input',
        content,
      });
    }
  }

  return input;
}

/** Gemini's spellings for each server-side tool, mapped to its Interactions type. */
const SERVER_TOOL_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    'google_search',
    ['googleSearch', 'google_search', 'googleSearchRetrieval', 'google_search_retrieval'],
  ],
  ['code_execution', ['codeExecution', 'code_execution']],
  ['url_context', ['urlContext', 'url_context']],
];

/** Convert Gemini-format tools into Interactions typed tool entries. */
export function toInteractionsTools(tools: Tool[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const tool of tools || []) {
    if (!tool || typeof tool !== 'object') {
      continue;
    }
    const raw = tool as Record<string, any>;
    const declarations = raw.functionDeclarations ?? raw.function_declarations;
    if (Array.isArray(declarations)) {
      for (const declaration of declarations) {
        if (!declaration?.name) {
          continue;
        }
        out.push({
          type: 'function',
          name: declaration.name,
          ...(declaration.description ? { description: declaration.description } : {}),
          ...(declaration.parameters
            ? { parameters: lowercaseSchemaTypes(declaration.parameters) }
            : {}),
        });
      }
    }
    for (const [type, aliases] of SERVER_TOOL_ALIASES) {
      if (aliases.some((alias) => raw[alias])) {
        out.push({ type });
      }
    }
  }
  return out;
}

/**
 * Restrict advertised functions to `allowedFunctionNames`.
 *
 * Interactions has no `tool_choice`, so an allow-list can only be honored by not
 * offering the other functions in the first place. Server-side tools are kept.
 */
function filterAllowedFunctions(
  tools: Record<string, unknown>[],
  allowedFunctionNames: string[] | undefined,
): Record<string, unknown>[] {
  if (!allowedFunctionNames?.length) {
    return tools;
  }
  return tools.filter(
    (tool) => tool.type !== 'function' || allowedFunctionNames.includes(tool.name as string),
  );
}

/**
 * Whether a model-named function has a callback the caller actually registered.
 *
 * A plain object inherits `constructor`, `toString`, `valueOf` and friends, so a
 * bare index lookup would treat a model-chosen name like `constructor` as a
 * registered callback and invoke it. Only own properties count.
 */
function getRegisteredCallback(
  callbacks: CompletionOptions['functionToolCallbacks'],
  name: string,
): unknown {
  return callbacks && Object.prototype.hasOwnProperty.call(callbacks, name)
    ? callbacks[name]
    : undefined;
}

/** Flatten a Gemini system instruction into the plain string Interactions takes. */
function flattenSystemInstruction(systemInstruction: unknown): string | undefined {
  if (!systemInstruction) {
    return undefined;
  }
  if (typeof systemInstruction === 'string') {
    return systemInstruction;
  }
  const parts = (systemInstruction as { parts?: Array<{ text?: string }> }).parts;
  if (!Array.isArray(parts)) {
    return undefined;
  }
  const text = parts
    .map((part) => part?.text)
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
  return text || undefined;
}

type NormalizedFunctionCall = { id?: string; name: string; args: unknown };

/**
 * Function calls the model is still waiting on.
 *
 * `executed` filters out calls we already answered: a stored interaction fetched
 * with GET replays its whole timeline, so an answered call reappears on later
 * rounds and would otherwise be run twice or emitted as pending output.
 */
function collectPendingFunctionCalls(
  steps: InteractionStep[],
  executed: ReadonlySet<string>,
): NormalizedFunctionCall[] {
  return steps
    .filter((step) => step.type === 'function_call' && typeof step.name === 'string')
    .map((step) => ({ id: step.id, name: step.name as string, args: step.arguments ?? {} }))
    .filter((call) => !call.id || !executed.has(call.id));
}

/**
 * Search queries the model actually issued.
 *
 * `generateContent` reports these as `webSearchQueries` in grounding metadata;
 * Interactions puts them on the `google_search_call` step, so surface them under
 * the same key to keep grounding assertions and reports working across both
 * transports.
 */
function collectSearchQueries(steps: InteractionStep[]): string[] {
  return steps
    .filter((step) => step.type === 'google_search_call')
    .flatMap((step) => {
      const args = step.arguments;
      const queries = (args as { queries?: unknown } | undefined)?.queries;
      return Array.isArray(queries)
        ? queries.filter((q): q is string => typeof q === 'string')
        : [];
    });
}

function collectText(steps: InteractionStep[]): string {
  return steps
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || [])
    .filter((content) => content.type === 'text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('');
}

/** Gemini-only generationConfig keys that Interactions rewrites or rejects. */
const SKIPPED_GENERATION_FIELDS = new Set([
  'thinkingConfig',
  'responseSchema',
  'response_schema',
  'responseMimeType',
  'response_mime_type',
]);

/** Translate Gemini generation options into the snake_case generation_config. */
function buildGenerationConfig(config: GoogleProviderConfig): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
    ...(config.topP === undefined ? {} : { top_p: config.topP }),
    ...(config.topK === undefined ? {} : { top_k: config.topK }),
    ...(config.maxOutputTokens === undefined ? {} : { max_output_tokens: config.maxOutputTokens }),
    ...(config.stopSequences === undefined ? {} : { stop_sequences: config.stopSequences }),
    ...(config.generationConfig?.thinkingConfig?.thinkingLevel
      ? { thinking_level: config.generationConfig.thinkingConfig.thinkingLevel.toLowerCase() }
      : {}),
  };
  // Pass through any other generationConfig fields the caller set.
  for (const [field, value] of Object.entries(config.generationConfig || {})) {
    if (SKIPPED_GENERATION_FIELDS.has(field)) {
      continue;
    }
    generationConfig[field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()] = value;
  }
  return generationConfig;
}

type UsageTotals = {
  prompt: number;
  completion: number;
  thoughts: number;
  cached: number;
  audioIn: number;
  audioOut: number;
  imageIn: number;
  cachedAudio: number;
  cachedImage: number;
  total: number;
  requests: number;
};

/** Video input is billed at the image rate, matching the generateContent path. */
const IMAGE_RATE_MODALITIES = ['image', 'document', 'video'];

/** A fresh zeroed accumulator. */
function newUsageTotals(): UsageTotals {
  return {
    prompt: 0,
    completion: 0,
    thoughts: 0,
    cached: 0,
    audioIn: 0,
    audioOut: 0,
    imageIn: 0,
    cachedAudio: 0,
    cachedImage: 0,
    total: 0,
    requests: 0,
  };
}

type ToolLoopResult = {
  lastData: InteractionResponse;
  totals: UsageTotals;
  billable: UsageTotals;
  executedToolCalls: Array<{ name: string; args: unknown; result?: unknown; error?: string }>;
  groundingCalls: Array<Record<string, unknown>>;
  allCached: boolean;
  /** Calls already answered, so the final output does not repeat them. */
  executedCallIds: ReadonlySet<string>;
};

/** Fold one response's usage into the running totals for this call. */
function accumulateUsage(totals: UsageTotals, usage: InteractionResponse['usage']): void {
  totals.prompt += (usage?.total_input_tokens ?? 0) + (usage?.total_tool_use_tokens ?? 0);
  totals.completion += usage?.total_output_tokens ?? 0;
  totals.thoughts += usage?.total_reasoning_tokens ?? usage?.total_thought_tokens ?? 0;
  totals.cached += usage?.total_cached_tokens ?? 0;
  totals.total += usage?.total_tokens ?? 0;
  totals.audioIn +=
    getInteractionModalityTokenCount(usage?.input_tokens_by_modality, ['audio']) +
    getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, ['audio']);
  totals.imageIn +=
    getInteractionModalityTokenCount(usage?.input_tokens_by_modality, IMAGE_RATE_MODALITIES) +
    getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, IMAGE_RATE_MODALITIES);
  totals.audioOut += getInteractionModalityTokenCount(usage?.output_tokens_by_modality, ['audio']);
  totals.cachedAudio += getInteractionModalityTokenCount(usage?.cached_tokens_by_modality, [
    'audio',
  ]);
  totals.cachedImage += getInteractionModalityTokenCount(
    usage?.cached_tokens_by_modality,
    IMAGE_RATE_MODALITIES,
  );
  totals.requests++;
}

/**
 * Resolve server-side retention settings and strip the fields they govern out of
 * `passthrough`.
 *
 * Google stores interactions by default (55 days on the paid tier), which is the
 * wrong default for eval and red-team payloads, so AI Studio defaults to
 * `store: false`. `passthrough` is merged into the request body last, so a
 * `store` or `previous_interaction_id` supplied there would silently defeat
 * these checks; both are resolved from either source before validating.
 */
function resolveRetention(
  config: GoogleProviderConfig,
  isVertexMode: boolean,
):
  | {
      store: boolean;
      previousInteractionId?: string;
      passthrough: Record<string, unknown>;
      passthroughGenerationConfig: unknown;
    }
  | { error: string } {
  const {
    generation_config: passthroughGenerationConfig,
    store: passthroughStore,
    previous_interaction_id: passthroughPreviousId,
    previousInteractionId: passthroughPreviousIdCamel,
    ...passthrough
  } = (config.passthrough || {}) as Record<string, unknown>;

  const passthroughPrevious = [passthroughPreviousId, passthroughPreviousIdCamel].find(
    (value): value is string => typeof value === 'string',
  );
  const previousInteractionId = config.previousInteractionId ?? passthroughPrevious;
  const requestedStore =
    config.store ?? (typeof passthroughStore === 'boolean' ? passthroughStore : undefined);

  if (previousInteractionId && isVertexMode) {
    // Vertex accepts previous_interaction_id with HTTP 200 but does not thread the
    // stored history into the turn, so honoring it would silently drop the
    // conversation. Verified against the live API; Omni rejects it for the same reason.
    return {
      error:
        'Gemini Interactions on Vertex AI does not support previousInteractionId; the stored history is silently ignored. Use the Google AI Studio route for server-side history, or pass prior turns in the prompt.',
    };
  }
  if (previousInteractionId && requestedStore === false) {
    return {
      error:
        'previousInteractionId requires store: true. The Gemini Interactions API rejects a stored-history reference when store is false.',
    };
  }
  if (isVertexMode && requestedStore === false) {
    logger.warn(
      '[Google Interactions] Vertex AI requires store: true for Interactions; the request will likely be rejected.',
    );
  }

  return {
    // Vertex rejects `store: false` outright ("must set store to true"), so the
    // privacy-preserving default only applies to the AI Studio route.
    store: requestedStore ?? (isVertexMode || Boolean(previousInteractionId)),
    previousInteractionId,
    passthrough,
    passthroughGenerationConfig,
  };
}

/**
 * Gemini chat provider that speaks the Interactions API instead of
 * `generateContent`.
 */
export class GoogleInteractionsChatProvider extends GoogleGenericProvider {
  /** Vertex project id, resolved lazily on the first call. */
  private resolvedProjectId?: string;

  id(): string {
    if (this.customId) {
      return this.customId();
    }
    return this.isVertexMode
      ? `vertex:interactions:${this.modelName}`
      : `google:interactions:${this.modelName}`;
  }

  toString(): string {
    const service = this.isVertexMode ? 'Vertex AI' : 'Google AI Studio';
    return `[Google ${service} Interactions Provider ${this.modelName}]`;
  }

  getApiEndpoint(): string {
    if (this.isVertexMode) {
      const projectId = this.resolvedProjectId ?? this.config.projectId;
      if (!projectId) {
        throw new Error(
          'Vertex project ID has not been resolved yet; call callApi() or set config.projectId.',
        );
      }
      return getVertexInteractionsEndpoint(this.config, projectId, this.env);
    }
    return getInteractionsEndpoint(this.config, this.env);
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const transport = await resolveInteractionsTransport(this.config, this.env, {
      vertex: this.isVertexMode,
      label: 'Gemini Interactions',
    });
    if ('error' in transport) {
      throw new Error(transport.error);
    }
    return transport.headers;
  }

  /**
   * Build the tool list for the request.
   *
   * Interactions has no `tool_choice` field, so a disabled policy or an
   * allow-list can only be honored by withholding declarations. `passthrough`
   * is folded in *before* the policy runs, since it is merged into the body last
   * and would otherwise reinstate whatever the policy removed.
   */
  private async resolveTools(
    config: GoogleProviderConfig,
    context: CallApiContextParams | undefined,
    passthrough: Record<string, unknown>,
  ): Promise<{ tools: Record<string, unknown>[]; toolsDisabled: boolean }> {
    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);
    const configured = await this.getAllTools(context, { skipExecutableToolFiles: toolsDisabled });
    const fromPassthrough =
      passthrough.tools === undefined
        ? []
        : ((Array.isArray(passthrough.tools) ? passthrough.tools : [passthrough.tools]) as Tool[]);
    const combined = [...configured, ...fromPassthrough];
    return {
      tools: filterAllowedFunctions(
        toInteractionsTools(toolsDisabled ? removeGoogleFunctionDeclarations(combined) : combined),
        toolConfig?.functionCallingConfig?.allowedFunctionNames,
      ),
      toolsDisabled,
    };
  }

  /**
   * Run one registered callback and render its outcome as text for the model.
   *
   * A thrown callback is reported back to the model rather than aborting the
   * eval, so a broken tool shows up as a bad answer, not a provider crash.
   */
  private async runOneCallback(
    call: { id?: string; name: string; args: unknown },
    config: GoogleProviderConfig,
  ): Promise<{ text: string; record: { result?: unknown; error?: string } }> {
    try {
      const output = await this.executeFunctionCallback(
        call.name,
        typeof call.args === 'string' ? call.args : JSON.stringify(call.args ?? {}),
        config,
        call.id,
      );
      // JSON.stringify(undefined) is undefined, which would drop `text` from the
      // payload and make the next request malformed.
      const text = typeof output === 'string' ? output : (JSON.stringify(output) ?? String(output));
      return { text, record: { result: output } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { text: `Error: ${message}`, record: { error: message } };
    }
  }

  /**
   * Drive one exchange to completion, resolving tool calls along the way.
   *
   * Returns the final interaction plus the usage accumulated across every round,
   * so the caller can report tokens for the whole exchange while billing only
   * the rounds that actually reached Google.
   */
  private async runToolLoop(args: {
    endpoint: string;
    headers: Record<string, string>;
    baseBody: Record<string, unknown>;
    config: GoogleProviderConfig;
    context?: CallApiContextParams;
    input: InteractionInputItem[];
    previousInteractionId?: string;
    store: boolean;
    toolsDisabled: boolean;
  }): Promise<ToolLoopResult | { error: ProviderResponse }> {
    const { endpoint, headers, baseBody, config, context, store, toolsDisabled } = args;
    // Accumulated across tool rounds so token usage reflects the whole exchange.
    const totals = newUsageTotals();
    // Mirrors `totals` but counts only rounds that were not served from cache.
    const billable = newUsageTotals();
    const executedToolCalls: Array<{
      name: string;
      args: unknown;
      result?: unknown;
      error?: string;
    }> = [];
    // A stored interaction fetched with GET replays its whole timeline, so the
    // same function_call can reappear on a later round. Track what we already
    // ran so a tool never fires twice and the loop cannot spin on stale calls.
    const executedCallIds = new Set<string>();
    const groundingCalls: Array<Record<string, unknown>> = [];

    let currentInput: InteractionInputItem[] = args.input;
    let currentPreviousInteractionId = args.previousInteractionId;
    let lastData: InteractionResponse | undefined;
    let allCached = true;
    let rounds = 0;
    const maxRounds = DEFAULT_MAX_TOOL_ROUNDS;

    while (rounds <= maxRounds) {
      rounds++;
      const body = {
        ...baseBody,
        input: currentInput,
        ...(currentPreviousInteractionId
          ? { previous_interaction_id: currentPreviousInteractionId }
          : {}),
      };

      const result = await this.postInteraction(endpoint, headers, body, config, context);
      if ('error' in result) {
        return { error: result.error };
      }
      const { data, cached } = result;
      lastData = data;
      allCached = allCached && cached;

      accumulateUsage(totals, data.usage);
      if (!cached) {
        // Only uncached rounds are billable; a partially cached tool loop must
        // still report the cost of the rounds that reached Google.
        accumulateUsage(billable, data.usage);
      }
      for (const grounding of data.usage?.grounding_tool_count || []) {
        groundingCalls.push({ ...grounding });
      }

      const turnSteps = getLatestTurnSteps(data);
      const functionCalls = collectPendingFunctionCalls(turnSteps, executedCallIds);
      const callbacks = toolsDisabled ? undefined : config.functionToolCallbacks;
      const runnable = functionCalls.filter((call) => getRegisteredCallback(callbacks, call.name));

      // Continue only when every pending call can be answered. Executing a
      // subset would replace this response with the next round and silently
      // drop the calls that had no callback.
      if (runnable.length !== functionCalls.length) {
        if (runnable.length > 0) {
          const unhandled = functionCalls
            .filter((call) => !getRegisteredCallback(callbacks, call.name))
            .map((call) => call.name);
          logger.warn(
            '[Google Interactions] Returning pending function calls without running the tool loop; no callback is registered for some of them.',
            { pending: functionCalls.length, unhandled },
          );
        }
        break;
      }
      if (runnable.length === 0 || rounds > maxRounds) {
        if (runnable.length > 0) {
          logger.warn(
            `[Google Interactions] Stopped after ${maxRounds} tool rounds with function calls still pending.`,
          );
        }
        break;
      }

      const results: InteractionInputItem[] = [];
      for (const call of runnable) {
        if (call.id) {
          executedCallIds.add(call.id);
        }
        const outcome = await this.runOneCallback(call, config);
        executedToolCalls.push({ name: call.name, args: call.args, ...outcome.record });
        results.push({
          type: 'function_result',
          ...(call.id ? { call_id: call.id } : {}),
          name: call.name,
          result: [{ type: 'text', text: outcome.text }],
        });
      }

      if (store && data.id && !this.isVertexMode) {
        currentPreviousInteractionId = data.id;
        currentInput = results;
      } else {
        // Stateless continuation: resend the timeline with the tool results
        // appended. Verified against the live API - the model's own
        // `function_call` step must not be replayed.
        currentInput = [...currentInput, ...results];
      }
    }

    if (!lastData) {
      return { error: { error: 'Gemini Interactions API returned no data' } };
    }
    return {
      lastData,
      totals,
      billable,
      executedToolCalls,
      groundingCalls,
      allCached,
      executedCallIds,
    };
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    ) as GoogleProviderConfig;

    const retention = resolveRetention(config, this.isVertexMode);
    if ('error' in retention) {
      return { error: retention.error };
    }
    const { store, previousInteractionId, passthrough, passthroughGenerationConfig } = retention;

    if (config.safetySettings) {
      logger.warn(
        '[Google Interactions] safetySettings is not supported by the Gemini Interactions API and was dropped from the request.',
      );
    }

    const transport = await resolveInteractionsTransport(config, this.env, {
      vertex: this.isVertexMode,
      label: 'Gemini Interactions',
    });
    if ('error' in transport) {
      return { error: transport.error };
    }
    if (this.isVertexMode) {
      // Cache so the synchronous getApiEndpoint() contract can be honored.
      const match = /\/projects\/([^/]+)\//.exec(transport.endpoint);
      if (match) {
        this.resolvedProjectId = decodeURIComponent(match[1]);
      }
    }
    const { endpoint, headers } = transport;

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );
    const input = geminiContentsToInteractionsInput(contents);
    if (input.length === 0) {
      return { error: 'Prompt is required for the Gemini Interactions API' };
    }

    const { tools, toolsDisabled } = await this.resolveTools(config, context, passthrough);

    const generationConfig = buildGenerationConfig(config);

    // generateContent accepts the schema at the top level or nested under
    // generationConfig; both must reach response_format, or opting into
    // Interactions would silently downgrade structured output to free text.
    const rawResponseSchema =
      config.responseSchema ??
      config.generationConfig?.response_schema ??
      (config.generationConfig as { responseSchema?: unknown } | undefined)?.responseSchema;
    let responseFormat: unknown;
    if (rawResponseSchema) {
      const schema = maybeLoadFromExternalFile(
        renderVarsInObject(rawResponseSchema, context?.vars),
      );
      try {
        // `responseSchema` is typed as a string, so a literal schema arrives
        // unparsed; Interactions needs the object itself.
        responseFormat = lowercaseSchemaTypes(parseStringObject(schema));
      } catch (err) {
        return {
          error: `Gemini Interactions API error: responseSchema is not valid JSON: ${String(err)}`,
        };
      }
    }

    const unexpressibleMode = getUnexpressibleToolMode(config);
    if (unexpressibleMode) {
      logger.warn(
        `[Google Interactions] The Interactions API has no tool_choice field, so functionCallingConfig.mode ${unexpressibleMode} cannot be enforced; the model may skip the required call.`,
      );
    }

    // `tools` is already resolved above; re-spreading it here would undo the policy.
    const { tools: _passthroughTools, ...passthroughWithoutTools } = passthrough;
    const systemText = flattenSystemInstruction(systemInstruction);
    const mergedGenerationConfig = {
      ...generationConfig,
      ...(isPlainObject(passthroughGenerationConfig) ? passthroughGenerationConfig : {}),
    };

    const baseBody: Record<string, unknown> = {
      model: this.modelName,
      ...(systemText ? { system_instruction: systemText } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(Object.keys(mergedGenerationConfig).length > 0
        ? { generation_config: mergedGenerationConfig }
        : {}),
      // Verified accepted by the live API and echoed back on the response.
      ...(config.service_tier ? { service_tier: config.service_tier } : {}),
      store,
      ...passthroughWithoutTools,
      background: false,
      stream: false,
    };

    const exchange = await this.runToolLoop({
      endpoint,
      headers,
      baseBody,
      config,
      context,
      input,
      previousInteractionId,
      store,
      toolsDisabled,
    });
    if ('error' in exchange) {
      return exchange.error;
    }
    const { lastData, totals, billable, executedToolCalls, groundingCalls, allCached } = exchange;
    const { executedCallIds } = exchange;
    if (!lastData) {
      return { error: 'Gemini Interactions API returned no data' };
    }

    const turnSteps = getLatestTurnSteps(lastData);
    const text = collectText(turnSteps);
    const functionCalls = collectPendingFunctionCalls(turnSteps, executedCallIds);
    const webSearchQueries = collectSearchQueries(turnSteps);
    const serverToolSteps = turnSteps
      .map((step) => step.type)
      .filter(
        (type): type is string =>
          typeof type === 'string' &&
          (type.startsWith('google_search') || type.startsWith('code_execution')),
      );

    let output: string;
    if (functionCalls.length > 0) {
      // Mirror the Vertex/AI Studio array-of-parts shape so `is-valid-function-call`
      // and existing function-call assertions keep working.
      output = JSON.stringify([
        ...(text ? [{ text }] : []),
        ...functionCalls.map((call) => ({
          functionCall: { name: call.name, args: call.args, ...(call.id ? { id: call.id } : {}) },
        })),
      ]);
    } else {
      output = text;
    }

    const cost =
      billable.requests === 0
        ? undefined
        : calculateGoogleCost(
            this.modelName,
            this.isVertexMode ? { ...config, region: this.getRegion() } : config,
            billable.prompt,
            billable.completion + billable.thoughts,
            this.isVertexMode,
            billable.audioIn,
            billable.audioOut,
            0,
            billable.imageIn,
            billable.cached,
            billable.cachedAudio,
            billable.cachedImage,
          );

    return {
      output,
      cached: allCached,
      raw: lastData,
      tokenUsage: {
        prompt: totals.prompt,
        completion: totals.completion,
        total: totals.total || totals.prompt + totals.completion + totals.thoughts,
        cached: totals.cached,
        numRequests: totals.requests,
        ...(totals.thoughts > 0
          ? {
              completionDetails: {
                reasoning: totals.thoughts,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }
          : {}),
      },
      cost,
      metadata: {
        ...(lastData.id ? { interactionId: lastData.id } : {}),
        ...(lastData.status ? { interactionStatus: lastData.status } : {}),
        interactionStored: store,
        ...(executedToolCalls.length > 0 ? { toolCalls: executedToolCalls } : {}),
        ...(groundingCalls.length > 0 ? { groundingToolCalls: groundingCalls } : {}),
        ...(webSearchQueries.length > 0 ? { webSearchQueries } : {}),
        ...(serverToolSteps.length > 0 ? { serverToolSteps } : {}),
      },
    };
  }

  /**
   * POST one interaction and poll until it leaves `in_progress`.
   *
   * Returns `{ error }` already shaped as a `ProviderResponse` so `callApi` can
   * return it directly.
   */
  private async postInteraction(
    endpoint: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    config: GoogleProviderConfig,
    context?: CallApiContextParams,
  ): Promise<{ data: InteractionResponse; cached: boolean } | { error: ProviderResponse }> {
    // Credentials are folded into the cache key as a hash so responses can be
    // cached (like every other Google provider) without the key itself becoming
    // part of a persisted fingerprint.
    const authDiscriminator = createAuthCacheDiscriminator(headers);
    const bustCache = context?.bustCache ?? context?.debug ?? false;
    const requestTimeoutMs = config.timeoutMs ?? getRequestTimeoutMs();
    let data: InteractionResponse;
    let cached: boolean;
    let httpStatus: number;
    let httpStatusText: string;
    try {
      ({
        data,
        cached,
        status: httpStatus,
        statusText: httpStatusText,
      } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          ...(authDiscriminator && { _authHash: authDiscriminator }),
        } as RequestInit,
        requestTimeoutMs,
        'json',
        bustCache,
      )) as { data: InteractionResponse; cached: boolean; status: number; statusText: string });
    } catch (err) {
      return { error: { error: `Gemini Interactions API error: ${String(err)}` } };
    }

    if (data?.error?.message) {
      return {
        error: { error: `Gemini Interactions API error: ${data.error.message}`, raw: data },
      };
    }
    if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) {
      // Gateways and proxies can fail without a Google-shaped `error.message` body.
      return {
        error: {
          error: `Gemini Interactions API error: HTTP ${httpStatus} ${httpStatusText}`.trim(),
          raw: data,
        },
      };
    }

    const pollTimeoutMs = requestTimeoutMs;
    const pollStartedAt = Date.now();
    let pollCount = 0;
    while (data?.status === 'in_progress' && data.id) {
      const elapsed = Date.now() - pollStartedAt;
      if (elapsed >= pollTimeoutMs) {
        return {
          error: {
            error: `Gemini interaction timed out after ${pollTimeoutMs}ms (status: ${data.status})`,
            raw: data,
          },
        };
      }
      if (pollCount > 0) {
        await sleep(Math.min(1_000, pollTimeoutMs - elapsed));
      }
      try {
        let polledCached: boolean;
        ({
          data,
          cached: polledCached,
          status: httpStatus,
          statusText: httpStatusText,
        } = (await fetchWithCache(
          `${endpoint}/${encodeURIComponent(data.id)}`,
          {
            method: 'GET',
            headers,
            ...(authDiscriminator && { _authHash: authDiscriminator }),
          } as RequestInit,
          Math.max(pollTimeoutMs - (Date.now() - pollStartedAt), 1),
          'json',
          // Always bust: caching a poll would freeze the interaction on its
          // first `in_progress` snapshot and guarantee a timeout.
          true,
        )) as { data: InteractionResponse; cached: boolean; status: number; statusText: string });
        // A cached poll still means this result was not freshly billed.
        cached = cached || polledCached;
      } catch (err) {
        return { error: { error: `Gemini Interactions API polling error: ${String(err)}` } };
      }
      pollCount++;
      if (data?.error?.message) {
        return {
          error: { error: `Gemini Interactions API error: ${data.error.message}`, raw: data },
        };
      }
      if (httpStatus && (httpStatus < 200 || httpStatus >= 300)) {
        return {
          error: {
            error:
              `Gemini Interactions API polling error: HTTP ${httpStatus} ${httpStatusText}`.trim(),
            raw: data,
          },
        };
      }
    }

    if (data?.status && !['completed', 'requires_action'].includes(data.status)) {
      return {
        error: {
          error: `Gemini interaction did not complete (status: ${data.status})`,
          raw: data,
        },
      };
    }

    const failedStep = getLatestTurnSteps(data).find((step) => step.error?.message);
    if (failedStep) {
      return {
        error: { error: `Gemini Interactions API error: ${failedStep.error?.message}`, raw: data },
      };
    }

    return { data, cached };
  }
}
