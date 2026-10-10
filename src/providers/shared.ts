import { getEnvBool, getEnvInt } from '../envars';
import { getCallerAbortError } from '../util/fetch/requestSignal';
import { loadYaml } from '../util/yamlLoad';

import type {
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types/index';

/** An explicit bustCache setting takes precedence over the legacy debug fallback. */
export function shouldBustProviderCache(
  context?: Pick<CallApiContextParams, 'bustCache' | 'debug'>,
): boolean {
  return context?.bustCache ?? context?.debug ?? false;
}

/**
 * Mark cached responses without changing reported usage or cost. The evaluator
 * uses the cache marker to calculate incurred usage; missing counts stay unknown.
 */
export function withResponseCacheMetadata<T extends ProviderResponse | ProviderEmbeddingResponse>(
  response: T,
  cached: boolean,
): Omit<T, 'cached' | 'tokenUsage'> & Pick<ProviderResponse, 'tokenUsage'> & { cached: boolean } {
  if (!cached || !response.tokenUsage) {
    return { ...response, cached };
  }
  const base: Omit<T, 'cached' | 'tokenUsage'> = response;
  const { cached: reportedCached, ...usage } = response.tokenUsage;
  const providerCached =
    usage.completionDetails?.cacheReadInputTokens ??
    (response.cached === true ? undefined : reportedCached);
  return {
    ...base,
    cached,
    tokenUsage: {
      ...usage,
      ...(providerCached !== undefined && {
        completionDetails: { ...usage.completionDetails, cacheReadInputTokens: providerCached },
      }),
      ...(usage.total !== undefined && { cached: usage.total }),
      numRequests: 0,
      incurredTokenUsage: {},
    },
  };
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw getCallerAbortError(signal);
  }
}

/** Stop only this caller's wait; shared work keeps running and its rejection is observed. */
export function waitForPromiseWithAbort<T>(
  promise: PromiseLike<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) {
    return Promise.resolve(promise);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(getCallerAbortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}

/** Returns the complete model suffix after the given number of provider/type segments. */
export function modelNameFromProviderPath(providerPath: string, segments: number): string {
  return providerPath.split(':').slice(segments).join(':');
}

/**
 * The default timeout for API requests in milliseconds.
 */
export function getRequestTimeoutMs(): number {
  return getEnvInt('REQUEST_TIMEOUT_MS', 300_000);
}

/** Read a simple eval variable without evaluating template expressions. */
export function resolveDirectTestVariable(value: unknown, vars?: Record<string, unknown>): unknown {
  if (typeof value !== 'string' || getEnvBool('PROMPTFOO_DISABLE_TEMPLATING')) {
    return value;
  }
  const variable = /^\{\{\s*([A-Za-z_]\w*)\s*\}\}$/.exec(value)?.[1];
  return variable && vars && Object.prototype.hasOwnProperty.call(vars, variable)
    ? vars[variable]
    : value;
}

/** Match OpenAI-compatible output-limit environment precedence. */
export function getOpenAIChatOutputLimitFromEnv(): number | undefined {
  return getOpenAICompletionTokenLimitFromEnv() ?? getEnvInt('OPENAI_MAX_TOKENS');
}

export function getOpenAICompletionTokenLimitFromEnv(): number | undefined {
  return getEnvInt('OPENAI_MAX_COMPLETION_TOKENS');
}

/**
 * Extended timeout for long-running models (deep research, gpt-5-pro, etc.) in milliseconds.
 * These models can take significantly longer to respond due to their complex reasoning.
 */
export const LONG_RUNNING_MODEL_TIMEOUT_MS = 600_000; // 10 minutes

interface ModelCost {
  input: number;
  output: number;
  audioInput?: number;
  audioOutput?: number;
  longContext?: {
    input: number;
    output: number;
    threshold: number;
  };
}

interface ProviderModel {
  id: string;
  cost?: ModelCost;
}

export interface ProviderConfig {
  cost?: number;
  inputCost?: number;
  outputCost?: number;
  audioCost?: number;
  audioInputCost?: number;
  audioOutputCost?: number;
  videoOutputCost?: number;
  imageInputCost?: number;
  service_tier?: string | null;
  passthrough?: object;
}

/**
 * Calculates the cost of an API call based on the model and token usage.
 *
 * @param {string} modelName The name of the model used.
 * @param {ProviderConfig} config The provider configuration.
 * @param {number | undefined} promptTokens The number of tokens in the prompt.
 * @param {number | undefined} completionTokens The number of tokens in the completion.
 * @param {ProviderModel[]} models An array of available models with their costs.
 * @returns {number | undefined} The calculated cost, or undefined if it can't be calculated.
 */
export function calculateCost(
  modelName: string,
  config: ProviderConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  models: ProviderModel[],
): number | undefined {
  if (
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    typeof promptTokens === 'undefined' ||
    typeof completionTokens === 'undefined'
  ) {
    return undefined;
  }

  const model = models.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const longContextCost =
    model.cost.longContext && promptTokens > model.cost.longContext.threshold
      ? model.cost.longContext
      : undefined;
  const inputCost = config.inputCost ?? config.cost ?? longContextCost?.input ?? model.cost.input;
  const outputCost =
    config.outputCost ?? config.cost ?? longContextCost?.output ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens;
}

/**
 * Clamp reported cached prompt tokens to [0, promptTokens] for cost billing.
 *
 * Providers occasionally report cached token counts that exceed prompt tokens
 * (rounding) or values that are negative or non-finite; billing those raw would
 * produce negative or NaN costs.
 */
export function clampCachedTokens(cachedTokens: number | undefined, promptTokens: number): number {
  return Number.isFinite(cachedTokens) ? Math.min(Math.max(cachedTokens!, 0), promptTokens) : 0;
}

/**
 * Checks if a string looks like it's attempting to be JSON.
 * This helps distinguish between actual JSON attempts and plain text that happens to start/end with brackets.
 */
function looksLikeJson(prompt: string): boolean {
  const trimmed = prompt.trim();

  // Objects starting with { are almost always JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return true;
  }

  // Arrays starting with [ need more careful checking
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    // Check if the character after [ suggests it's JSON
    // Valid JSON array starts: ", {, [, whitespace, number, or true/false/null
    const afterBracket = trimmed.slice(1).trimStart();
    if (
      afterBracket.startsWith('"') ||
      afterBracket.startsWith('{') ||
      afterBracket.startsWith('[') ||
      /^[\d-]/.test(afterBracket) || // number
      /^(true|false|null)/.test(afterBracket) // boolean or null
    ) {
      return true;
    }
    // Otherwise, it's likely plain text (e.g., [INST]...[/INST])
    return false;
  }

  return false;
}

/**
 * Parses a chat prompt string into a structured format.
 *
 * @template T The expected return type of the parsed prompt.
 * @param {string} prompt The input prompt string to parse.
 * @param {T} defaultValue The default value to return if parsing fails.
 * @returns {T} The parsed prompt or the default value.
 * @throws {Error} If the prompt is invalid YAML or JSON (when required).
 */
export function parseChatPrompt<T>(prompt: string, defaultValue: T): T {
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.startsWith('- role:')) {
    try {
      // Try YAML - some legacy OpenAI prompts are YAML :(
      return loadYaml(prompt) as T;
    } catch (err) {
      throw new Error(`Chat Completion prompt is not a valid YAML string: ${err}\n\n${prompt}`);
    }
  } else {
    try {
      // Try JSON
      return JSON.parse(prompt) as T;
    } catch (err) {
      if (getEnvBool('PROMPTFOO_REQUIRE_JSON_PROMPTS') || looksLikeJson(trimmedPrompt)) {
        throw new Error(`Chat Completion prompt is not a valid JSON string: ${err}\n\n${prompt}`);
      }
      // Fall back to the provided default value
      return defaultValue;
    }
  }
}

/**
 * Converts a string to title case.
 *
 * @param {string} str The input string to convert.
 * @returns {string} The input string converted to title case.
 */
export function toTitleCase(str: string) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function isPromptfooSampleTarget(provider: ApiProvider) {
  const url = provider.config?.url;
  return url?.includes('promptfoo.app') || url?.includes('promptfoo.dev');
}

// ==================
// OpenAI Tool Choice (Canonical Format)
// ==================

/**
 * OpenAI-native tool choice format, used as the canonical representation.
 * Providers transform this to their native format.
 */
export type OpenAIToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

export type ToolChoiceFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Checks if the given value is an OpenAI tool choice format.
 * Detects string values ('auto', 'none', 'required') and
 * the object form ({ type: 'function', function: { name } }).
 */
export function isOpenAIToolChoice(obj: unknown): obj is OpenAIToolChoice {
  if (typeof obj === 'string') {
    return ['auto', 'none', 'required'].includes(obj);
  }
  if (typeof obj === 'object' && obj !== null) {
    const candidate = obj as Record<string, unknown>;
    if (
      candidate.type === 'function' &&
      typeof candidate.function === 'object' &&
      candidate.function !== null
    ) {
      const fn = candidate.function as Record<string, unknown>;
      return typeof fn.name === 'string';
    }
  }
  return false;
}

/**
 * Transforms an OpenAI tool choice to Anthropic format.
 */
export function openaiToolChoiceToAnthropic(choice: OpenAIToolChoice): {
  type: string;
  name?: string;
} {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { type: 'auto' };
      case 'none':
        return { type: 'none' };
      case 'required':
        return { type: 'any' };
    }
  }
  return { type: 'tool', name: choice.function.name };
}

/**
 * Transforms an OpenAI tool choice to Bedrock Converse format.
 */
export function openaiToolChoiceToBedrock(
  choice: OpenAIToolChoice,
): { auto: object } | { any: object } | { tool: { name: string } } | undefined {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { auto: {} };
      case 'none':
        // Bedrock doesn't have 'none', return undefined to omit toolChoice
        return undefined;
      case 'required':
        return { any: {} };
    }
  }
  return { tool: { name: choice.function.name } };
}

/**
 * Transforms an OpenAI tool choice to Google (Gemini) format.
 */
export function openaiToolChoiceToGoogle(
  choice: OpenAIToolChoice,
): { functionCallingConfig: { mode: string; allowedFunctionNames?: string[] } } | undefined {
  if (typeof choice === 'string') {
    switch (choice) {
      case 'auto':
        return { functionCallingConfig: { mode: 'AUTO' } };
      case 'none':
        return { functionCallingConfig: { mode: 'NONE' } };
      case 'required':
        return { functionCallingConfig: { mode: 'ANY' } };
    }
  }
  return {
    functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [choice.function.name] },
  };
}

/**
 * Transforms an OpenAI tool choice to the specified provider format.
 * If the input is not in OpenAI format, it's returned as-is (native passthrough).
 */
export function transformToolChoice(toolChoice: unknown, format: ToolChoiceFormat): unknown {
  // If not OpenAI format, pass through as-is (native provider format)
  if (!isOpenAIToolChoice(toolChoice)) {
    return toolChoice;
  }

  switch (format) {
    case 'openai':
      return toolChoice;
    case 'anthropic':
      return openaiToolChoiceToAnthropic(toolChoice);
    case 'bedrock':
      return openaiToolChoiceToBedrock(toolChoice);
    case 'google':
      return openaiToolChoiceToGoogle(toolChoice);
    default:
      return toolChoice;
  }
}

// ==================
// Tool Format Transformation
// ==================

/**
 * OpenAI tool format.
 * This is the canonical format for tool definitions. Use `transformToolsFormat`
 * to convert OpenAI-format tools to other provider formats (Anthropic, Bedrock, Google).
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    /** Enables strict schema validation */
    strict?: boolean;
  };
}

/**
 * Anthropic tool format
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

/**
 * Bedrock Converse tool format
 */
export interface BedrockTool {
  toolSpec: {
    name: string;
    description?: string;
    inputSchema: {
      json: Record<string, unknown>;
    };
  };
}

/**
 * Google tool format (array of function declarations)
 */
export interface GoogleTool {
  functionDeclarations: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

/**
 * Checks if an array contains OpenAI-format tools.
 * Returns true if the first tool has `type: 'function'` and `function.name`.
 */
export function isOpenAIToolArray(tools: unknown): tools is OpenAITool[] {
  if (!Array.isArray(tools) || tools.length === 0) {
    return false;
  }
  const first = tools[0];
  if (typeof first !== 'object' || first === null) {
    return false;
  }
  const candidate = first as Record<string, unknown>;
  return (
    candidate.type === 'function' &&
    typeof candidate.function === 'object' &&
    candidate.function !== null &&
    typeof (candidate.function as Record<string, unknown>).name === 'string'
  );
}

/**
 * Transforms OpenAI-format tools to Anthropic format.
 */
export function openaiToolsToAnthropic(tools: OpenAITool[]): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    input_schema: tool.function.parameters || { type: 'object', properties: {} },
  }));
}

/**
 * Transforms OpenAI-format tools to Bedrock Converse format.
 */
export function openaiToolsToBedrock(tools: OpenAITool[]): BedrockTool[] {
  return tools.map((tool) => ({
    toolSpec: {
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      inputSchema: {
        json: tool.function.parameters || { type: 'object', properties: {} },
      },
    },
  }));
}

/**
 * Sanitizes a schema for Google/Gemini compatibility.
 * - Converts type strings to uppercase (string → STRING)
 * - Removes unsupported properties (additionalProperties, $schema, default)
 * - Recursively processes nested schemas
 */
function sanitizeSchemaForGoogle(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    // Skip unsupported properties
    if (['additionalProperties', '$schema', 'default', '$id', '$ref'].includes(key)) {
      continue;
    }

    if (key === 'type' && typeof value === 'string') {
      // Convert type to uppercase
      result[key] = value.toUpperCase();
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      // Recursively sanitize properties
      const sanitizedProps: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof propValue === 'object' && propValue !== null) {
          sanitizedProps[propKey] = sanitizeSchemaForGoogle(propValue as Record<string, unknown>);
        } else {
          sanitizedProps[propKey] = propValue;
        }
      }
      result[key] = sanitizedProps;
    } else if (key === 'items' && typeof value === 'object' && value !== null) {
      // Recursively sanitize array items
      result[key] = sanitizeSchemaForGoogle(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Transforms OpenAI-format tools to Google/Gemini format.
 */
export function openaiToolsToGoogle(tools: OpenAITool[]): GoogleTool[] {
  const functionDeclarations = tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    ...(tool.function.parameters
      ? { parameters: sanitizeSchemaForGoogle(tool.function.parameters) }
      : {}),
  }));
  return [{ functionDeclarations }];
}

// ==================
// Chat History with Tool Calls (Canonical Format)
// ==================

/**
 * OpenAI-style tool call as it appears in chat history (`assistant.tool_calls`).
 * `function.arguments` may be an object (as in promptfoo YAML/JSON prompts)
 * or a JSON string (as returned by the OpenAI API).
 */
export interface OpenAIChatToolCall {
  id?: string;
  type?: string;
  function: {
    name: string;
    arguments?: string | Record<string, unknown>;
  };
}

/**
 * OpenAI-style chat message. This is the canonical history format:
 * providers transform it to their native representation.
 */
export interface OpenAIChatMessage {
  role: string;
  content?: string | unknown[] | Record<string, unknown> | null;
  tool_calls?: OpenAIChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export type ChatHistoryFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Returns true when the array contains OpenAI-style tool history:
 * an assistant message with `tool_calls`, or a tool-result message
 * (`role: 'tool'` or `tool_call_id` present).
 */
export function hasOpenAIToolMessages(messages: unknown): messages is OpenAIChatMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false;
  }
  return messages.some(
    (msg) =>
      typeof msg === 'object' &&
      msg !== null &&
      (Array.isArray((msg as Record<string, unknown>).tool_calls) ||
        typeof (msg as Record<string, unknown>).tool_call_id === 'string' ||
        (msg as Record<string, unknown>).role === 'tool'),
  );
}

/** Parse `function.arguments` which may be an object or a JSON string. */
function parseToolCallArguments(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) {
    return {};
  }
  if (typeof args === 'object') {
    return args as Record<string, unknown>;
  }
  if (typeof args === 'string') {
    const trimmed = args.trim();
    if (trimmed === '') {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Normalize message content to a string for tool-result blocks. */
function toolResultContentToString(content: unknown): string {
  if (content === undefined || content === null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/**
 * Transforms OpenAI-style chat history with tool calls to Anthropic format
 * (`tool_use` / `tool_result` content blocks).
 */
export function openaiChatToAnthropic(messages: OpenAIChatMessage[]): Array<{
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown>>;
}> {
  return messages
    .filter((msg) => msg && typeof msg === 'object' && typeof msg.role === 'string')
    .flatMap((msg) => {
      if (msg.role === 'system') {
        // System prompts are extracted separately by the Anthropic provider.
        return [];
      }
      if (msg.role === 'tool' || msg.tool_call_id) {
        return [
          {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result',
                tool_use_id: msg.tool_call_id ?? msg.name ?? '',
                content: toolResultContentToString(msg.content),
              },
            ],
          },
        ];
      }
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        const blocks: Array<Record<string, unknown>> = [];
        if (typeof msg.content === 'string' && msg.content !== '') {
          blocks.push({ type: 'text', text: msg.content });
        }
        for (const call of msg.tool_calls) {
          if (!call || typeof call !== 'object' || !call.function) {
            continue;
          }
          blocks.push({
            type: 'tool_use',
            id: call.id ?? call.function.name,
            name: call.function.name,
            input: parseToolCallArguments(call.function.arguments),
          });
        }
        return [{ role: 'assistant' as const, content: blocks }];
      }
      const role = msg.role === 'assistant' ? ('assistant' as const) : ('user' as const);
      const text =
        typeof msg.content === 'string' ? msg.content : toolResultContentToString(msg.content);
      return [{ role, content: [{ type: 'text', text }] }];
    });
}

/**
 * Maps a single OpenAI-style message to Gemini parts. Returns an empty array
 * for system messages (handled as `systemInstruction` downstream).
 */
function openaiMessageToGoogleParts(msg: OpenAIChatMessage): Array<Record<string, unknown>> {
  if (msg.role === 'tool' || msg.tool_call_id) {
    return [
      {
        functionResponse: {
          ...(msg.tool_call_id ? { id: msg.tool_call_id } : {}),
          name: msg.name ?? 'function',
          response: { result: toolResultContentToString(msg.content) },
        },
      },
    ];
  }
  if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    const parts: Array<Record<string, unknown>> = [];
    if (typeof msg.content === 'string' && msg.content !== '') {
      parts.push({ text: msg.content });
    }
    for (const call of msg.tool_calls) {
      if (!call || typeof call !== 'object' || !call.function) {
        continue;
      }
      parts.push({
        functionCall: {
          ...(call.id ? { id: call.id } : {}),
          name: call.function.name,
          args: parseToolCallArguments(call.function.arguments),
        },
      });
    }
    return parts;
  }
  const text =
    typeof msg.content === 'string' ? msg.content : toolResultContentToString(msg.content);
  return [{ text }];
}

function openaiMessageToGoogleRole(
  msg: OpenAIChatMessage,
  targetAssistantRole: 'model' | 'assistant',
): 'user' | 'model' | 'assistant' {
  if (msg.role === 'tool' || msg.tool_call_id) {
    return 'user';
  }
  return msg.role === 'assistant' ? targetAssistantRole : 'user';
}

/**
 * Transforms OpenAI-style chat history with tool calls to Gemini format
 * (`functionCall` / `functionResponse` parts).
 */
export function openaiChatToGoogle(
  messages: OpenAIChatMessage[],
  useAssistantRole = false,
): Array<{ role?: 'user' | 'model' | 'assistant'; parts: Array<Record<string, unknown>> }> {
  const targetAssistantRole = useAssistantRole ? 'assistant' : 'model';
  return messages
    .filter((msg) => msg && typeof msg === 'object' && typeof msg.role === 'string')
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: openaiMessageToGoogleRole(msg, targetAssistantRole),
      parts: openaiMessageToGoogleParts(msg),
    }));
}

/**
 * Transforms OpenAI-style chat history with tool calls to Bedrock Converse
 * format. Emits Anthropic-compatible `tool_use` / `tool_result` blocks, which
 * the Bedrock Converse provider already converts to native
 * `toolUse` / `toolResult` content blocks.
 */
export function openaiChatToBedrock(messages: OpenAIChatMessage[]): Array<{
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown>>;
}> {
  return openaiChatToAnthropic(messages);
}

/**
 * Transforms OpenAI-style chat history with tool calls to the specified
 * provider format. Messages without tool history, or that are already in a
 * native format, are returned as-is.
 */
export function transformChatMessages(messages: unknown, format: ChatHistoryFormat): unknown {
  if (!hasOpenAIToolMessages(messages)) {
    return messages;
  }
  switch (format) {
    case 'openai':
      return messages;
    case 'anthropic':
      return openaiChatToAnthropic(messages);
    case 'bedrock':
      return openaiChatToBedrock(messages);
    case 'google':
      return openaiChatToGoogle(messages);
    default:
      return messages;
  }
}

export type ToolFormat = 'openai' | 'anthropic' | 'bedrock' | 'google';

/**
 * Transforms tools from OpenAI format to the specified provider format.
 * If the input is not in OpenAI format, it's returned as-is.
 */
export function transformTools(tools: unknown, format: ToolFormat): unknown {
  // If not OpenAI format, pass through as-is
  if (!isOpenAIToolArray(tools)) {
    return tools;
  }

  switch (format) {
    case 'openai':
      return tools; // Already in OpenAI format
    case 'anthropic':
      return openaiToolsToAnthropic(tools);
    case 'bedrock':
      return openaiToolsToBedrock(tools);
    case 'google':
      return openaiToolsToGoogle(tools);
    default:
      return tools;
  }
}
