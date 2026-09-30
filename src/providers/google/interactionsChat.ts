import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { sleep } from '../../util/time';
import { getRequestTimeoutMs } from '../shared';
import { GoogleGenericProvider } from './base';
import {
  getInteractionModalityTokenCount,
  getInteractionsApiKey,
  getInteractionsEndpoint,
  getLatestTurnSteps,
  getVertexInteractionsEndpoint,
  getVertexInteractionsRegion,
  resolveInteractionsTransport,
} from './interactionsShared';
import {
  calculateGoogleCost,
  geminiFormatAndSystemInstructions,
  getGoogleResponseServiceTier,
  mergeGoogleCompletionOptions,
  parseStringObject,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
  validateFunctionCall,
} from './util';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { GoogleProviderOptions } from './base';
import type { InteractionResponse, InteractionStep } from './interactionsShared';
import type { CompletionOptions, GoogleProviderConfig, Tool } from './types';

/** Upper bound on server round-trips while resolving `functionToolCallbacks`. */
const DEFAULT_MAX_TOOL_ROUNDS = 8;

type InteractionInputItem = Record<string, unknown>;

/** True for a non-null, non-array object - the shape passthrough blocks must have. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isInteractionResponse(value: unknown): value is InteractionResponse {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.steps === undefined) {
    return typeof value.status === 'string';
  }
  return (
    Array.isArray(value.steps) &&
    value.steps.every(
      (step) =>
        isPlainObject(step) &&
        (step.content === undefined ||
          (Array.isArray(step.content) && step.content.every(isPlainObject))),
    )
  );
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

function lowercaseSchemaTypes(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(lowercaseSchemaTypes);
  }
  if (!isPlainObject(node)) {
    return node;
  }
  const maps = new Set([
    'properties',
    'patternProperties',
    '$defs',
    'definitions',
    'dependentSchemas',
  ]);
  const schemas = new Set([
    'items',
    'prefixItems',
    'additionalItems',
    'additionalProperties',
    'unevaluatedProperties',
    'unevaluatedItems',
    'contains',
    'propertyNames',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
    'if',
    'then',
    'else',
  ]);
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      if (key === 'type') {
        return [
          key,
          Array.isArray(value)
            ? value.map((entry) => (typeof entry === 'string' ? entry.toLowerCase() : entry))
            : typeof value === 'string'
              ? value.toLowerCase()
              : value,
        ];
      }
      if (maps.has(key) && isPlainObject(value)) {
        return [
          key,
          Object.fromEntries(
            Object.entries(value).map(([name, schema]) => [name, lowercaseSchemaTypes(schema)]),
          ),
        ];
      }
      return [key, schemas.has(key) ? lowercaseSchemaTypes(value) : value];
    }),
  );
}

/** Convert one Gemini `part` into an Interactions content entry. */
function geminiPartToInteractionContent(part: unknown): Record<string, unknown> | undefined {
  if (!part || typeof part !== 'object') {
    return undefined;
  }
  if (
    Object.keys(part).some(
      (key) => !['text', 'inlineData', 'inline_data', 'fileData', 'file_data'].includes(key),
    )
  ) {
    throw new Error(
      'Unsupported Gemini prompt part fields for the Interactions chat adapter. Use generateContent.',
    );
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
  parts?: unknown;
}): InteractionInputItem {
  if (source.parts !== undefined && (!Array.isArray(source.parts) || source.parts.length > 0)) {
    throw new Error(
      'Function response media is not supported by the Interactions chat adapter. Use generateContent.',
    );
  }
  const value = source.response ?? source;
  return {
    type: 'function_result',
    ...(source.id ? { call_id: source.id } : {}),
    ...(source.name ? { name: source.name } : {}),
    result: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
  };
}

export function geminiContentsToInteractionsInput(contents: unknown): InteractionInputItem[] {
  const list = Array.isArray(contents) ? contents : [contents];
  const input: InteractionInputItem[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const { role, parts } = entry as { role?: string; parts?: unknown[] };
    const partList = Array.isArray(parts) ? parts : [];

    let content: Record<string, unknown>[] = [];
    const flushContent = () => {
      if (content.length > 0) {
        input.push({
          type: role === 'model' || role === 'assistant' ? 'model_output' : 'user_input',
          content,
        });
        content = [];
      }
    };
    for (const part of partList) {
      const functionResponse = (part as { functionResponse?: any })?.functionResponse;
      if (functionResponse) {
        flushContent();
        input.push(toFunctionResult(functionResponse));
        continue;
      }
      const mapped = geminiPartToInteractionContent(part);
      if (!mapped) {
        throw new Error(
          'Unsupported Gemini prompt part for Interactions. Use text, inlineData, fileData, or functionResponse.',
        );
      }
      content.push(mapped);
    }
    flushContent();
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
const GEMINI_TOOL_KEYS = new Set([
  'functionDeclarations',
  'function_declarations',
  ...SERVER_TOOL_ALIASES.flatMap(([, aliases]) => aliases),
]);

/** Convert Gemini-format tools into Interactions typed tool entries. */
export function toInteractionsTools(tools: Tool[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const tool of tools || []) {
    if (!tool || typeof tool !== 'object') {
      continue;
    }
    const raw = tool as Record<string, any>;
    if (typeof raw.type === 'string') {
      out.push(raw);
      continue;
    }
    const unsupported = Object.keys(raw).find((key) => !GEMINI_TOOL_KEYS.has(key));
    if (unsupported) {
      throw new Error(
        `${unsupported} is not supported by the Interactions chat adapter. Use generateContent.`,
      );
    }
    const declarations = raw.functionDeclarations ?? raw.function_declarations;
    if (Array.isArray(declarations)) {
      for (const declaration of declarations) {
        if (!declaration?.name) {
          continue;
        }
        if (
          declaration.response ||
          declaration.responseJsonSchema ||
          declaration.response_json_schema
        ) {
          throw new Error(
            'Function response schemas are not supported by the Interactions chat adapter. Use generateContent.',
          );
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
      const alias = aliases.find((name) => raw[name]);
      if (alias) {
        if (!isPlainObject(raw[alias]) || Object.keys(raw[alias]).length > 0) {
          throw new Error(
            `Configured ${alias} options are not supported by the Interactions chat adapter. Use a native tool in passthrough.tools or generateContent.`,
          );
        }
        out.push({ type });
      }
    }
  }
  return out;
}

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

function collectPendingFunctionCalls(
  steps: InteractionStep[],
  executed: ReadonlySet<string>,
): NormalizedFunctionCall[] {
  return steps
    .filter((step) => step.type === 'function_call' && typeof step.name === 'string')
    .map((step) => ({ id: step.id, name: step.name as string, args: step.arguments ?? {} }))
    .filter((call) => !call.id || !executed.has(call.id));
}

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

function validateChatOptions(config: GoogleProviderConfig): void {
  if (config.modelArmor || config.passthrough?.model_armor_config) {
    throw new Error(
      'Model Armor is not supported by the Interactions chat adapter. Use generateContent.',
    );
  }
  if (
    config.safetySettings ||
    config.passthrough?.safety_settings ||
    config.passthrough?.safetySettings
  ) {
    throw new Error(
      'safetySettings is not supported by the Interactions chat adapter. Use generateContent.',
    );
  }
  if (config.mcp?.enabled) {
    throw new Error('MCP is not supported by the Interactions chat adapter. Use generateContent.');
  }
  const { toolConfig } = resolveGoogleToolConfig(config);
  const mode = toolConfig?.functionCallingConfig?.mode;
  if (mode && !['AUTO', 'NONE', 'MODE_UNSPECIFIED'].includes(mode)) {
    throw new Error(
      'Required or named tool choices are not supported by the Interactions chat adapter. Use generateContent.',
    );
  }
  if (
    config.passthrough?.tool_choice !== undefined ||
    (toolConfig &&
      (Object.keys(toolConfig).some((key) => key !== 'functionCallingConfig') ||
        toolConfig.functionCallingConfig?.streamFunctionCallArguments))
  ) {
    throw new Error(
      'Unsupported tool policy for the Interactions chat adapter. Use generateContent.',
    );
  }
  const generation: Record<string, unknown> = {
    ...config.generationConfig,
    ...(isPlainObject(config.passthrough?.generationConfig)
      ? config.passthrough.generationConfig
      : {}),
    ...(isPlainObject(config.passthrough?.generation_config)
      ? config.passthrough.generation_config
      : {}),
  };
  const allowed = new Set([
    'temperature',
    'topP',
    'top_p',
    'topK',
    'top_k',
    'maxOutputTokens',
    'max_output_tokens',
    'stopSequences',
    'stop_sequences',
    'seed',
    'thinkingConfig',
    'thinking_level',
    'responseSchema',
    'response_schema',
    'responseMimeType',
    'response_mime_type',
  ]);
  for (const key of Object.keys(generation)) {
    if (!allowed.has(key)) {
      throw new Error(
        `generationConfig.${key} is not supported by the Interactions chat adapter. Use generateContent.`,
      );
    }
  }
  if (
    isPlainObject(generation.thinkingConfig) &&
    Object.keys(generation.thinkingConfig).some((key) => key !== 'thinkingLevel')
  ) {
    throw new Error(
      'Only thinkingLevel is supported in Interactions thinkingConfig. Use generateContent for thinkingBudget.',
    );
  }
  const mime = generation.responseMimeType ?? generation.response_mime_type;
  if (
    mime &&
    (mime !== 'application/json' ||
      !(
        config.responseSchema ??
        generation.responseSchema ??
        generation.response_schema ??
        config.passthrough?.response_format
      ))
  ) {
    throw new Error(
      'Interactions JSON output requires a response schema. Use generateContent for other response modalities.',
    );
  }
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

/** Normalize usage across interaction rounds. */
function buildTokenUsage(totals: UsageTotals) {
  const reasoning =
    totals.thoughts > 0
      ? {
          completionDetails: {
            reasoning: totals.thoughts,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        }
      : {};
  return {
    prompt: totals.prompt,
    completion: totals.completion,
    total: totals.total,
    cached: totals.cached,
    numRequests: totals.requests,
    ...reasoning,
  };
}

type ToolLoopResult = {
  lastData: InteractionResponse;
  totals: UsageTotals;
  cost?: number;
  executedToolCalls: Array<{ name: string; args: unknown; result?: unknown; error?: string }>;
  groundingCalls: Array<Record<string, unknown>>;
  /** Calls already answered, so the final output does not repeat them. */
  executedCallIds: ReadonlySet<string>;
};

/** Fold one response's usage into the running totals for this call. */
function accumulateUsage(totals: UsageTotals, usage: InteractionResponse['usage']): UsageTotals {
  const prompt = (usage?.total_input_tokens ?? 0) + (usage?.total_tool_use_tokens ?? 0);
  const completion = usage?.total_output_tokens ?? 0;
  const thoughts = usage?.total_reasoning_tokens ?? usage?.total_thought_tokens ?? 0;
  const round: UsageTotals = {
    prompt,
    completion,
    thoughts,
    cached: usage?.total_cached_tokens ?? 0,
    total: usage?.total_tokens ?? prompt + completion + thoughts,
    audioIn:
      getInteractionModalityTokenCount(usage?.input_tokens_by_modality, ['audio']) +
      getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, ['audio']),
    imageIn:
      getInteractionModalityTokenCount(usage?.input_tokens_by_modality, IMAGE_RATE_MODALITIES) +
      getInteractionModalityTokenCount(usage?.tool_use_tokens_by_modality, IMAGE_RATE_MODALITIES),
    audioOut: getInteractionModalityTokenCount(usage?.output_tokens_by_modality, ['audio']),
    cachedAudio: getInteractionModalityTokenCount(usage?.cached_tokens_by_modality, ['audio']),
    cachedImage: getInteractionModalityTokenCount(
      usage?.cached_tokens_by_modality,
      IMAGE_RATE_MODALITIES,
    ),
    requests: 1,
  };
  for (const field of Object.keys(round) as Array<keyof UsageTotals>) {
    totals[field] += round[field];
  }
  return round;
}

function resolveRetention(
  config: GoogleProviderConfig,
  isVertexMode: boolean,
):
  | {
      store: boolean;
      previousInteractionId?: string;
      passthrough: Record<string, unknown>;
      passthroughGenerationConfig: Record<string, unknown>;
    }
  | { error: string } {
  const {
    generation_config: passthroughGenerationConfig,
    generationConfig: passthroughGenerationConfigCamel,
    store: passthroughStore,
    previous_interaction_id: passthroughPreviousId,
    previousInteractionId: passthroughPreviousIdCamel,
    ...passthrough
  } = (config.passthrough || {}) as Record<string, unknown>;

  if (
    [config.store, passthroughStore].some(
      (value) => value !== undefined && typeof value !== 'boolean',
    )
  ) {
    return { error: 'Interactions store must be a boolean.' };
  }
  const passthroughPrevious = [passthroughPreviousId, passthroughPreviousIdCamel].find(
    (value): value is string => typeof value === 'string',
  );
  const previousInteractionId = config.previousInteractionId ?? passthroughPrevious;
  const requestedStore =
    config.store ?? (typeof passthroughStore === 'boolean' ? passthroughStore : undefined);

  if (previousInteractionId && isVertexMode) {
    // Vertex accepts previous_interaction_id with HTTP 200 but does not thread the
    // stored history into the turn, so honoring it would silently drop the
    // conversation. Keep the same restriction as the Omni provider.
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
    return {
      error:
        'Vertex Interactions requires store: true. Use generateContent when server-side storage is not acceptable.',
    };
  }

  return {
    // Vertex rejects `store: false` outright ("must set store to true"), so the
    // privacy-preserving default only applies to the AI Studio route.
    store: requestedStore ?? (isVertexMode || Boolean(previousInteractionId)),
    previousInteractionId,
    passthrough,
    passthroughGenerationConfig: {
      ...(isPlainObject(passthroughGenerationConfigCamel) ? passthroughGenerationConfigCamel : {}),
      ...(isPlainObject(passthroughGenerationConfig) ? passthroughGenerationConfig : {}),
    },
  };
}

export class GoogleInteractionsChatProvider extends GoogleGenericProvider {
  /** Vertex project id, resolved lazily on the first call. */
  private resolvedProjectId?: string;

  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    if (options.config?.mcp?.enabled) {
      throw new Error(
        'MCP is not supported by the Interactions chat adapter. Use generateContent.',
      );
    }
    super(modelName, options);
  }

  id(): string {
    if (this.customId) {
      return this.customId();
    }
    return this.isVertexMode
      ? `vertex:interactions:${this.modelName}`
      : `google:interactions:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return getInteractionsApiKey(this.config, this.env);
  }

  validateFunctionToolCall(output: string | object, vars?: CallApiContextParams['vars']): void {
    validateFunctionCall(
      output,
      this.config.tools,
      vars,
      (this.config.passthrough as { tools?: Tool[] | string } | undefined)?.tools,
    );
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
        toInteractionsTools(
          toolsDisabled ? removeGoogleFunctionDeclarations(combined) : combined,
        ).filter((tool) => !toolsDisabled || tool.type !== 'function'),
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
      return { text: 'Tool execution failed.', record: { error: message } };
    }
  }

  /** Resolve tool calls and retain accounting for every completed request. */
  private async runToolLoop(args: {
    endpoint: string;
    headers: Record<string, string>;
    baseBody: Record<string, unknown>;
    config: GoogleProviderConfig;
    abortSignal?: AbortSignal;
    input: InteractionInputItem[];
    previousInteractionId?: string;
    store: boolean;
    toolsDisabled: boolean;
  }): Promise<ToolLoopResult | { error: ProviderResponse }> {
    const { endpoint, headers, baseBody, config, abortSignal, store, toolsDisabled } = args;
    // Accumulated across tool rounds so token usage reflects the whole exchange.
    const totals = newUsageTotals();
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
    const recordAnsweredCalls = (steps: Array<{ type?: unknown; call_id?: unknown }>) => {
      for (const step of steps) {
        if (step.type === 'function_result' && typeof step.call_id === 'string') {
          executedCallIds.add(step.call_id);
        }
      }
    };
    recordAnsweredCalls(args.input);
    const groundingCalls: Array<Record<string, unknown>> = [];

    // The full conversation, always. `currentInput` is what this round sends,
    // which is just the new results when the server is holding the thread.
    const timeline: InteractionInputItem[] = [...args.input];
    let currentInput: InteractionInputItem[] = timeline;
    let currentPreviousInteractionId = args.previousInteractionId;
    let lastData: InteractionResponse | undefined;
    let rounds = 0;
    const maxRounds = DEFAULT_MAX_TOOL_ROUNDS;

    let totalCost = 0;
    let fullyPriced = true;
    const cost = () => (fullyPriced && totals.requests > 0 ? totalCost : undefined);
    const failure = (error: ProviderResponse): { error: ProviderResponse } => ({
      error: {
        ...error,
        ...(totals.requests > 0 ? { tokenUsage: buildTokenUsage(totals), cost: cost() } : {}),
        ...(!error.raw && lastData ? { raw: lastData } : {}),
        metadata: {
          ...error.metadata,
          ...(executedToolCalls.length > 0 ? { rateLimitRetryable: false } : {}),
          ...(executedToolCalls.length > 0 ? { toolCalls: executedToolCalls } : {}),
          ...(groundingCalls.length > 0 ? { groundingToolCalls: groundingCalls } : {}),
        },
      },
    });

    while (rounds <= maxRounds) {
      if (abortSignal?.aborted) {
        return failure({ error: 'Gemini Interactions request aborted.' });
      }
      rounds++;
      const body = {
        ...baseBody,
        input: currentInput,
        ...(currentPreviousInteractionId
          ? { previous_interaction_id: currentPreviousInteractionId }
          : {}),
      };

      const result = await this.postInteraction(endpoint, headers, body, config, abortSignal);
      if ('error' in result) {
        return failure(result.error);
      }
      const { data } = result;
      lastData = data;
      const roundUsage = accumulateUsage(totals, data.usage);
      const roundCost = calculateGoogleCost(
        typeof baseBody.model === 'string' ? baseBody.model : this.modelName,
        this.isVertexMode
          ? { ...config, region: getVertexInteractionsRegion(config, this.env) }
          : config,
        roundUsage.prompt,
        roundUsage.completion + roundUsage.thoughts,
        this.isVertexMode,
        roundUsage.audioIn,
        roundUsage.audioOut,
        0,
        roundUsage.imageIn,
        roundUsage.cached,
        roundUsage.cachedAudio,
        roundUsage.cachedImage,
        result.serviceTier,
      );
      if (roundCost === undefined) {
        fullyPriced = false;
      } else {
        totalCost += roundCost;
      }
      recordAnsweredCalls(data.steps ?? []);
      for (const grounding of data.usage?.grounding_tool_count || []) {
        groundingCalls.push({ ...grounding });
      }

      const turnSteps = getLatestTurnSteps(data);
      const functionCalls = collectPendingFunctionCalls(turnSteps, executedCallIds);
      const callbacks = toolsDisabled ? undefined : config.functionToolCallbacks;
      const advertised =
        (baseBody.tools as Array<{ type?: string; name?: string }> | undefined) ?? [];
      const runnable = functionCalls.filter(
        (call) =>
          advertised.some((tool) => tool.type === 'function' && tool.name === call.name) &&
          getRegisteredCallback(callbacks, call.name),
      );

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
        if (abortSignal?.aborted) {
          return failure({ error: 'Gemini Interactions request aborted.' });
        }
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

      // Vertex ignores stored history, so it always resends the timeline.
      // Function-call steps are not input items, but intermediate model output is.
      const latestResult = turnSteps.map((step) => step.type).lastIndexOf('function_result');
      timeline.push(
        ...turnSteps
          .slice(latestResult + 1)
          .filter((step) => step.type === 'model_output')
          .map((step) => ({ type: 'model_output', content: step.content })),
        ...results,
      );
      const useServerState = store && !this.isVertexMode && Boolean(data.id);
      currentPreviousInteractionId = useServerState ? data.id : currentPreviousInteractionId;
      currentInput = useServerState ? results : timeline;
    }

    if (!lastData) {
      return failure({ error: 'Gemini Interactions API returned no data' });
    }
    return {
      lastData,
      totals,
      cost: cost(),
      executedToolCalls,
      groundingCalls,
      executedCallIds,
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      return await this.callInteraction(prompt, context, options);
    } catch (error) {
      return {
        error: `Gemini Interactions API error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async callInteraction(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
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

    validateChatOptions(config);

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

    try {
      const parsed: unknown = JSON.parse(prompt);
      if (
        isPlainObject(parsed) &&
        Array.isArray(parsed.contents) &&
        !('system_instruction' in parsed)
      ) {
        prompt = JSON.stringify(parsed.contents);
      }
    } catch {
      // The formatter also accepts plain text.
    }
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
      passthroughGenerationConfig.responseSchema ??
      passthroughGenerationConfig.response_schema ??
      config.responseSchema ??
      config.generationConfig?.response_schema ??
      (config.generationConfig as { responseSchema?: unknown } | undefined)?.responseSchema;
    let responseFormat: unknown;
    if (rawResponseSchema) {
      const renderedSchema = renderVarsInObject(rawResponseSchema, context?.vars);
      const schema = maybeLoadFromExternalFile(renderedSchema);
      try {
        // `responseSchema` is typed as a string, so a literal schema arrives
        // unparsed; Interactions needs the object itself.
        const parsedSchema = parseStringObject(schema);
        responseFormat = lowercaseSchemaTypes(
          typeof renderedSchema === 'string' && renderedSchema.startsWith('file://')
            ? renderVarsInObject(parsedSchema, context?.vars)
            : parsedSchema,
        );
      } catch (err) {
        return {
          error: `Gemini Interactions API error: responseSchema is not valid JSON: ${String(err)}`,
        };
      }
    }

    // `tools` is already resolved above; re-spreading it here would undo the policy.
    const {
      tools: _passthroughTools,
      toolConfig: _toolConfig,
      tool_config: _snakeToolConfig,
      ...passthroughWithoutTools
    } = passthrough;
    const systemText = flattenSystemInstruction(systemInstruction);
    const mergedGenerationConfig = {
      ...generationConfig,
      ...buildGenerationConfig({
        generationConfig: passthroughGenerationConfig,
      } as GoogleProviderConfig),
    };

    const baseBody: Record<string, unknown> = {
      model: this.modelName,
      ...(systemText ? { system_instruction: systemText } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
      ...(Object.keys(mergedGenerationConfig).length > 0
        ? { generation_config: mergedGenerationConfig }
        : {}),
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
      abortSignal: options?.abortSignal,
      input,
      previousInteractionId,
      store,
      toolsDisabled,
    });
    if ('error' in exchange) {
      return exchange.error;
    }
    const { lastData, totals, cost, executedToolCalls, groundingCalls } = exchange;
    const { executedCallIds } = exchange;
    if (!lastData) {
      return { error: 'Gemini Interactions API returned no data' };
    }

    const turnSteps = getLatestTurnSteps(lastData);
    const thoughtSignatures = turnSteps
      .map((step) => step.signature)
      .filter((signature): signature is string => typeof signature === 'string');
    if (
      turnSteps.some(
        (step) =>
          step.type === 'model_output' &&
          step.content?.some((part) =>
            ['image', 'video', 'audio', 'document'].includes(part.type ?? ''),
          ),
      )
    ) {
      return {
        error:
          'The Interactions chat adapter does not support media output. Use the corresponding media provider.',
        raw: lastData,
        tokenUsage: buildTokenUsage(totals),
        cost,
        metadata: {
          ...(executedToolCalls.length > 0 ? { toolCalls: executedToolCalls } : {}),
          ...(groundingCalls.length > 0 ? { groundingToolCalls: groundingCalls } : {}),
        },
      };
    }
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

    return {
      output,
      cached: false,
      raw: lastData,
      tokenUsage: buildTokenUsage(totals),
      cost,
      metadata: {
        ...(lastData.id ? { interactionId: lastData.id } : {}),
        ...(lastData.status ? { interactionStatus: lastData.status } : {}),
        interactionStored: store,
        ...(thoughtSignatures.length > 0 ? { thoughtSignatures } : {}),
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
    abortSignal?: AbortSignal,
  ): Promise<
    | { data: InteractionResponse; serviceTier?: ReturnType<typeof getGoogleResponseServiceTier> }
    | { error: ProviderResponse }
  > {
    const requestTimeoutMs = config.timeoutMs ?? getRequestTimeoutMs();
    let data: InteractionResponse;
    let httpStatus: number;
    let httpStatusText: string;
    let responseHeaders: Record<string, string> | undefined;
    let serviceTier: ReturnType<typeof getGoogleResponseServiceTier>;
    try {
      ({
        data,
        status: httpStatus,
        statusText: httpStatusText,
        headers: responseHeaders,
      } = (await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: abortSignal,
        } as RequestInit,
        requestTimeoutMs,
        'json',
        true,
      )) as {
        data: InteractionResponse;
        cached: boolean;
        status: number;
        statusText: string;
        headers?: Record<string, string>;
      });
    } catch (err) {
      return { error: { error: `Gemini Interactions API error: ${String(err)}` } };
    }
    serviceTier = getGoogleResponseServiceTier(responseHeaders, data?.usage);

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
        ({
          data,
          status: httpStatus,
          statusText: httpStatusText,
          headers: responseHeaders,
        } = (await fetchWithCache(
          `${endpoint}/${encodeURIComponent(data.id)}`,
          {
            method: 'GET',
            headers,
            signal: abortSignal,
          } as RequestInit,
          Math.max(pollTimeoutMs - (Date.now() - pollStartedAt), 1),
          'json',
          // Always bust: caching a poll would freeze the interaction on its
          // first `in_progress` snapshot and guarantee a timeout.
          true,
        )) as {
          data: InteractionResponse;
          cached: boolean;
          status: number;
          statusText: string;
          headers?: Record<string, string>;
        });
      } catch (err) {
        return { error: { error: `Gemini Interactions API polling error: ${String(err)}` } };
      }
      serviceTier = getGoogleResponseServiceTier(responseHeaders, data?.usage) ?? serviceTier;
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

    if (!isInteractionResponse(data)) {
      return { error: { error: 'Gemini Interactions API returned an invalid response object.' } };
    }

    // `incomplete` means the model ran out of budget mid-answer, but the partial
    // output is still there. generateContent returns it with finishReason
    // MAX_TOKENS rather than failing, so erroring here would lose real output.
    if (data?.status === 'incomplete') {
      logger.warn('[Google Interactions] Interaction ended early; returning partial output.', {
        status: data.status,
      });
    } else if (data?.status && !['completed', 'requires_action'].includes(data.status)) {
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

    return { data, serviceTier };
  }
}
