/**
 * Base class for Google AI providers.
 *
 * This abstract class provides shared functionality for both Google AI Studio
 * and Vertex AI providers, including:
 * - MCP (Model Context Protocol) client integration
 * - Function callback execution
 * - Tool normalization
 * - Resource cleanup
 *
 * Subclasses must implement:
 * - getApiEndpoint(): Returns the API endpoint URL
 * - getAuthHeaders(): Returns authentication headers
 * - callApi(): The main API call implementation
 */

import logger from '../../logger';
import {
  CallbackPathTraversalError,
  loadCallbackFromFileUrl,
  wrapError,
} from '../../util/functions/loadFunction';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { getNunjucksEngine } from '../../util/templates';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToGoogle } from '../mcp/transform';
import { getRequestTimeoutMs, transformTools } from '../shared';
import { withGenAIToolSpan } from '../tracing';
import { GoogleAuthManager } from './auth';
import { normalizeTools, stripExecutableToolFileReferences, validateFunctionCall } from './util';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';
import type {
  CompletionOptions,
  GoogleProviderConfig,
  StreamedFunctionCall,
  StreamedPartialArg,
  Tool,
} from './types';

/**
 * Options for creating a Google provider instance.
 */
export interface GoogleProviderOptions {
  /** Provider configuration */
  config?: GoogleProviderConfig;
  /** Custom provider ID override */
  id?: string;
  /** Environment variable overrides */
  env?: EnvOverrides;
}

interface PendingFunctionCall {
  id?: string;
  name?: string;
  args: Record<string, unknown>;
  argsText: string;
}

const MAX_STREAMED_FUNCTION_ARG_DEPTH = 64;
const MAX_STREAMED_FUNCTION_ARG_ARRAY_SLOTS = 10_000;

function setPartialFunctionArg(
  args: Record<string, unknown>,
  partialArg: StreamedPartialArg,
  budget: { arraySlots: number },
): boolean {
  const path = partialArg.jsonPath;
  if (!path || !/^\$(?:\.[\w$ -]+|\[\d+\]|\['[^'\\\]]*'\]|\["[^"\\\]]*"\])+$/.test(path)) {
    return false;
  }

  const segments = Array.from(
    path.matchAll(/\.([\w$ -]+)|\[(\d+)\]|\['([^'\\\]]*)'\]|\["([^"\\\]]*)"\]/g),
    (match) => (match[2] === undefined ? (match[1] ?? match[3] ?? match[4]) : Number(match[2])),
  );
  if (
    segments.length > MAX_STREAMED_FUNCTION_ARG_DEPTH ||
    segments.some(
      (segment) =>
        ['__proto__', 'prototype', 'constructor'].includes(String(segment)) ||
        (typeof segment === 'number' &&
          (!Number.isSafeInteger(segment) || segment >= MAX_STREAMED_FUNCTION_ARG_ARRAY_SLOTS)),
    )
  ) {
    return false;
  }

  let value: unknown;
  if ('stringValue' in partialArg) {
    value = partialArg.stringValue;
  } else if ('numberValue' in partialArg) {
    value = partialArg.numberValue;
  } else if ('boolValue' in partialArg) {
    value = partialArg.boolValue;
  } else if ('nullValue' in partialArg) {
    value = null;
  } else {
    return true;
  }

  let current: Record<string | number, unknown> = args;
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (Array.isArray(current)) {
      // Reject special properties such as length and quoted indices that bypass numeric validation.
      if (typeof segment !== 'number') {
        return false;
      }
      // JSON.stringify materializes sparse holes. Bound expansion across the entire response.
      const addedSlots = Math.max(0, segment + 1 - current.length);
      if (budget.arraySlots + addedSlots > MAX_STREAMED_FUNCTION_ARG_ARRAY_SLOTS) {
        return false;
      }
      budget.arraySlots += addedSlots;
    }
    const existing = current[segment];
    if (index === segments.length - 1) {
      current[segment] =
        typeof value === 'string' && typeof existing === 'string' ? existing + value : value;
      return true;
    }
    if (!existing || typeof existing !== 'object') {
      current[segment] = typeof segments[index + 1] === 'number' ? [] : {};
    }
    current = current[segment] as Record<string | number, unknown>;
  }

  return true;
}

function mergeStreamedFunctionArgs(pending: PendingFunctionCall, args: unknown): void {
  if (typeof args !== 'string') {
    if (args && typeof args === 'object' && !Array.isArray(args)) {
      pending.args = { ...pending.args, ...args };
    }
    return;
  }

  if (pending.argsText && !args.startsWith(pending.argsText)) {
    pending.argsText += args;
    return;
  }

  try {
    const parsed = JSON.parse(args);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      pending.args = { ...pending.args, ...parsed };
      pending.argsText = '';
      return;
    }
  } catch {
    // Some streaming integrations expose cumulative or fragmented JSON strings.
  }
  pending.argsText = args;
}

function finalizeStreamedFunctionCall(
  pending: PendingFunctionCall,
): StreamedFunctionCall | undefined {
  if (pending.argsText) {
    try {
      const parsed = JSON.parse(pending.argsText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return undefined;
      }
      pending.args = { ...pending.args, ...parsed };
    } catch {
      return undefined;
    }
  }

  return pending.name ? { id: pending.id, name: pending.name, args: pending.args } : undefined;
}

function assembleStreamedFunctionCalls(parts: any[]): StreamedFunctionCall[] | undefined {
  const completed: StreamedFunctionCall[] = [];
  const pendingById = new Map<string, PendingFunctionCall>();
  const budget = { arraySlots: 0 };
  let pendingUnnamed: PendingFunctionCall | undefined;

  for (const part of parts) {
    const functionCall = part?.functionCall as StreamedFunctionCall | undefined;
    if (!functionCall) {
      continue;
    }

    const id = functionCall.id;
    let pending = id ? pendingById.get(id) : pendingUnnamed;
    if (!id && pendingById.size > 0) {
      // Vertex can omit the ID after the first chunk. Only associate an unambiguous continuation.
      if (pendingUnnamed || pendingById.size !== 1) {
        return undefined;
      }
      pending = pendingById.values().next().value;
    }
    if (!pending) {
      pending = { id, name: functionCall.name, args: {}, argsText: '' };
      if (id) {
        pendingById.set(id, pending);
      } else {
        pendingUnnamed = pending;
      }
    } else if (functionCall.name) {
      if (pending.name && pending.name !== functionCall.name) {
        return undefined;
      }
      pending.name = functionCall.name;
    }

    if (functionCall.args !== undefined) {
      mergeStreamedFunctionArgs(pending, functionCall.args);
    }
    for (const partialArg of functionCall.partialArgs ?? []) {
      if (!setPartialFunctionArg(pending.args, partialArg, budget)) {
        return undefined;
      }
    }

    if (functionCall.willContinue === true) {
      continue;
    }

    const complete = finalizeStreamedFunctionCall(pending);
    if (!complete) {
      return undefined;
    }
    completed.push(complete);
    if (pending.id) {
      pendingById.delete(pending.id);
    } else {
      pendingUnnamed = undefined;
    }
  }

  return pendingById.size === 0 && !pendingUnnamed ? completed : undefined;
}

function restoreStreamedFunctionCallParts(
  parts: any[],
  functionCalls: StreamedFunctionCall[],
): any[] {
  const callsById = new Map<string, StreamedFunctionCall[]>();
  const unnamedCalls: StreamedFunctionCall[] = [];
  for (const functionCall of functionCalls) {
    if (functionCall.id) {
      const calls = callsById.get(functionCall.id) ?? [];
      calls.push(functionCall);
      callsById.set(functionCall.id, calls);
    } else {
      unnamedCalls.push(functionCall);
    }
  }

  const activeCallIds = new Set<string>();
  let unnamedCallInProgress = false;

  return parts.flatMap((part) => {
    const fragment = part?.functionCall as StreamedFunctionCall | undefined;
    if (!fragment) {
      return [part];
    }

    if (fragment.id) {
      if (activeCallIds.has(fragment.id)) {
        if (fragment.willContinue !== true) {
          activeCallIds.delete(fragment.id);
        }
        return [];
      }

      const functionCall = callsById.get(fragment.id)?.shift();
      if (!functionCall) {
        return [];
      }
      if (fragment.willContinue === true) {
        activeCallIds.add(fragment.id);
      }
      return [{ ...part, functionCall }];
    }

    if (!unnamedCallInProgress && activeCallIds.size === 1) {
      if (fragment.willContinue !== true) {
        activeCallIds.clear();
      }
      return [];
    }

    if (unnamedCallInProgress) {
      if (fragment.willContinue !== true) {
        unnamedCallInProgress = false;
      }
      return [];
    }

    const functionCall = unnamedCalls.shift();
    if (!functionCall) {
      return [];
    }
    unnamedCallInProgress = fragment.willContinue === true;
    return [{ ...part, functionCall }];
  });
}

/**
 * Abstract base class for Google AI providers.
 *
 * Provides shared functionality for Google AI Studio and Vertex AI,
 * with abstract methods for endpoint and authentication that differ
 * between the two services.
 */
export abstract class GoogleGenericProvider implements ApiProvider {
  /** The model name (e.g., 'gemini-2.5-pro') */
  modelName: string;

  /** Provider configuration */
  config: GoogleProviderConfig;

  /** Environment variable overrides */
  env?: EnvOverrides;

  /** Whether this provider is in Vertex AI mode */
  protected isVertexMode: boolean;

  /** MCP client for tool integration */
  protected mcpClient: MCPClient | null = null;

  /** Promise that resolves when MCP initialization is complete */
  protected initializationPromise: Promise<void> | null = null;

  /** Cache of loaded function callbacks */
  protected loadedFunctionCallbacks: Record<string, Function> = {};

  /** References used to populate the callback cache, for prompt-level overrides. */
  protected loadedFunctionCallbackRefs: Record<string, string | Function | undefined> = {};

  /** Custom provider ID function */
  protected customId?: () => string;

  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};

    // Determine mode using auth manager
    this.isVertexMode = GoogleAuthManager.determineVertexMode(this.config, this.env);

    // Validate and warn about potential auth issues
    GoogleAuthManager.validateAndWarn(
      {
        apiKey: this.config.apiKey,
        credentials: this.config.credentials,
        projectId: this.config.projectId,
        region: this.config.region,
        vertexai: this.isVertexMode,
        googleAuthOptions: this.config.googleAuthOptions,
        keyFilename: this.config.keyFilename,
        scopes: this.config.scopes,
        strictMutualExclusivity: this.config.strictMutualExclusivity,
      },
      this.env,
    );

    // Custom ID support
    if (id) {
      this.customId = () => id;
    }

    // Initialize MCP if configured
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  validateFunctionToolCall(output: string | object, vars?: CallApiContextParams['vars']): void {
    validateFunctionCall(output, this.config.tools, vars);
  }

  /**
   * Get the provider ID string.
   * Format: 'google:{model}' for AI Studio, 'vertex:{model}' for Vertex AI
   */
  id(): string {
    if (this.customId) {
      return this.customId();
    }
    return this.isVertexMode ? `vertex:${this.modelName}` : `google:${this.modelName}`;
  }

  /**
   * Get a string representation of the provider.
   */
  toString(): string {
    const service = this.isVertexMode ? 'Vertex AI' : 'Google AI Studio';
    return `[Google ${service} Provider ${this.modelName}]`;
  }

  /**
   * Get the API endpoint URL for requests.
   * Must be implemented by subclasses.
   */
  abstract getApiEndpoint(action?: string): string;

  /**
   * Get authentication headers for API requests.
   * Must be implemented by subclasses.
   *
   * @returns Headers object with authentication
   */
  abstract getAuthHeaders(): Promise<Record<string, string>>;

  /**
   * Make an API call with the given prompt.
   * Must be implemented by subclasses.
   */
  abstract callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse>;

  /**
   * Get the API key for this provider.
   * Applies Nunjucks rendering to support template variables.
   *
   * @returns The API key or undefined
   */
  requiresApiKey(): boolean {
    // Vertex AI supports OAuth/ADC authentication without an API key
    return !this.isVertexMode;
  }

  getApiKey(): string | undefined {
    const { apiKey } = GoogleAuthManager.getApiKey(this.config, this.env, this.isVertexMode);
    if (apiKey) {
      return getNunjucksEngine().renderString(apiKey, {});
    }
    return undefined;
  }

  /**
   * Get the region for Vertex AI.
   *
   * @returns The region (default: 'global' for OAuth, 'us-central1' for API key)
   */
  getRegion(): string {
    const hasApiKey = Boolean(this.getApiKey());
    return GoogleAuthManager.resolveRegion(this.config, this.env, hasApiKey);
  }

  /**
   * Get the project ID for Vertex AI.
   *
   * @returns Promise resolving to the project ID
   */
  async getProjectId(): Promise<string> {
    return GoogleAuthManager.resolveProjectId(
      {
        projectId: this.config.projectId,
        credentials: this.config.credentials,
        googleAuthOptions: this.config.googleAuthOptions,
        keyFilename: this.config.keyFilename,
        scopes: this.config.scopes,
      },
      this.env,
    );
  }

  /**
   * Initialize the MCP client for tool integration.
   */
  protected async initializeMCP(): Promise<void> {
    if (!this.config.mcp) {
      return;
    }
    this.mcpClient = new MCPClient(this.config.mcp);
    await this.mcpClient.initialize();
  }

  /**
   * Get all tools for the request, combining MCP tools and config tools.
   *
   * @param context - Call context with variables
   * @returns Array of Google-format tools
   */
  protected async getAllTools(
    context?: CallApiContextParams,
    options: { skipExecutableToolFiles?: boolean } = {},
  ): Promise<Tool[]> {
    // Get MCP tools if client is available
    const mcpTools = this.mcpClient ? transformMCPToolsToGoogle(this.mcpClient.getAllTools()) : [];

    // Get tools from prompt-level config first, fall back to provider config
    // This allows per-prompt tool overrides in test cases
    const promptConfig = context?.prompt?.config as CompletionOptions | undefined;
    const configTools = promptConfig?.tools ?? this.config.tools;
    const requestTools = options.skipExecutableToolFiles
      ? stripExecutableToolFileReferences(configTools, context?.vars)
      : configTools;
    const loadedTools = requestTools
      ? await maybeLoadToolsFromExternalFile(requestTools, context?.vars)
      : [];

    // Transform tools to Google format if needed
    const transformedTools = Array.isArray(loadedTools)
      ? (transformTools(loadedTools, 'google') as Tool[])
      : loadedTools
        ? [loadedTools]
        : [];
    const normalizedTools = normalizeTools(transformedTools);

    // Combine all tools
    const allTools = [...mcpTools, ...normalizedTools];

    return allTools;
  }

  /**
   * Load a function from an external file.
   *
   * @param fileRef - File reference in format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  protected async loadExternalFunction(fileRef: string): Promise<Function> {
    try {
      return await loadCallbackFromFileUrl(fileRef);
    } catch (error) {
      if (error instanceof CallbackPathTraversalError) {
        throw error;
      }
      throw wrapError(`Error loading function from ${fileRef}: ${(error as Error).message}`, error);
    }
  }

  /**
   * Execute a function callback with proper error handling.
   *
   * @param functionName - Name of the function to execute
   * @param args - JSON string of function arguments
   * @param config - Config containing function callbacks
   * @returns The function result
   */
  protected async executeFunctionCallback(
    functionName: string,
    args: string,
    config: CompletionOptions,
    callId?: string,
  ): Promise<any> {
    try {
      const callbacks = config.functionToolCallbacks;
      const callbackRef =
        callbacks && Object.prototype.hasOwnProperty.call(callbacks, functionName)
          ? callbacks[functionName]
          : undefined;
      let callback: Function | undefined = Object.prototype.hasOwnProperty.call(
        this.loadedFunctionCallbacks,
        functionName,
      )
        ? this.loadedFunctionCallbacks[functionName]
        : undefined;

      if (this.loadedFunctionCallbackRefs[functionName] !== callbackRef) {
        callback = undefined;
      }

      // If not loaded yet, try to load it now
      if (!callback) {
        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            // Inline function string (backward compatibility with existing behavior)
            // This uses Function constructor which has security implications
            logger.warn(
              `[GoogleProvider] Inline function string for '${functionName}' is deprecated. ` +
                `Use 'file://path/to/module.js:functionName' for better security.`,
            );
            try {
              // eslint-disable-next-line no-new-func
              callback = new Function('return ' + callbackStr)();
              if (typeof callback !== 'function') {
                throw new Error(`Expression did not return a function`);
              }
            } catch (err) {
              throw new Error(
                `Failed to parse inline function for '${functionName}': ${err}. ` +
                  `Consider using 'file://' prefix to reference an external file.`,
              );
            }
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
          this.loadedFunctionCallbackRefs[functionName] = callbackRef;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
          this.loadedFunctionCallbackRefs[functionName] = callbackRef;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await withGenAIToolSpan({ name: functionName, arguments: args, callId }, () =>
        callback(args),
      );

      return result;
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error;
    }
  }

  /**
   * Execute explicitly configured callbacks from native parts or trusted JSON
   * function-call envelopes. Local eval configuration and model-output feedback
   * loops share the trusted execution model documented in SECURITY.md.
   */
  protected async executeFunctionToolCallbacks(
    output: ProviderResponse['output'],
    config: CompletionOptions,
    toolsDisabled: boolean,
  ): Promise<ProviderResponse['output']> {
    if (toolsDisabled) {
      return output;
    }

    let parsedOutput: any = output;
    if (typeof output === 'string') {
      try {
        parsedOutput = JSON.parse(output);
      } catch {
        return output;
      }
    }

    const parts = Array.isArray(parsedOutput) ? parsedOutput : [parsedOutput];
    const passthroughToolConfig = config.passthrough?.toolConfig ?? config.passthrough?.tool_config;
    const effectiveToolConfig = (passthroughToolConfig ??
      config.toolConfig ??
      config.tool_config) as
      | {
          functionCallingConfig?: {
            streamFunctionCallArguments?: boolean;
            stream_function_call_arguments?: boolean;
          };
          function_calling_config?: {
            streamFunctionCallArguments?: boolean;
            stream_function_call_arguments?: boolean;
          };
        }
      | undefined;
    const functionCallingConfig =
      effectiveToolConfig?.functionCallingConfig ?? effectiveToolConfig?.function_calling_config;
    const streamsFunctionCallArguments =
      config.streaming === true &&
      (functionCallingConfig?.streamFunctionCallArguments === true ||
        functionCallingConfig?.stream_function_call_arguments === true);
    const functionCalls = streamsFunctionCallArguments
      ? assembleStreamedFunctionCalls(parts)
      : parts.flatMap((part) => (part?.functionCall ? [part.functionCall] : []));
    if (!functionCalls?.length) {
      return output;
    }

    if (!config.functionToolCallbacks) {
      return streamsFunctionCallArguments
        ? restoreStreamedFunctionCallParts(parts, functionCalls)
        : output;
    }

    const preparedCalls: Array<{ functionName: string; args: string; callId?: string }> = [];
    for (const functionCall of functionCalls) {
      const functionName = functionCall.name;
      if (!Object.prototype.hasOwnProperty.call(config.functionToolCallbacks, functionName)) {
        return output;
      }
      try {
        const args =
          typeof functionCall.args === 'string'
            ? JSON.parse(functionCall.args)
            : (functionCall.args ?? {});
        preparedCalls.push({ functionName, args: JSON.stringify(args), callId: functionCall.id });
      } catch {
        return output;
      }
    }

    if (preparedCalls.length === 0) {
      return output;
    }

    const results = [];
    for (const { functionName, args, callId } of preparedCalls) {
      try {
        results.push(await this.executeFunctionCallback(functionName, args, config, callId));
      } catch {
        // executeFunctionCallback already logs the error. Preserve the original
        // model output when a callback cannot be executed.
        return output;
      }
    }
    if (results.length === 1) {
      return results[0] ?? output;
    }
    return results
      .map((result) => {
        if (typeof result === 'string') {
          return result;
        }
        try {
          return JSON.stringify(result) ?? String(result);
        } catch {
          return String(result);
        }
      })
      .join('\n');
  }

  /**
   * Clean up resources (MCP client, etc.).
   * Should be called when the provider is no longer needed.
   */
  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      if (this.initializationPromise != null) {
        await this.initializationPromise;
      }
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  /**
   * Get the request timeout in milliseconds.
   */
  protected getTimeout(): number {
    return this.config.timeoutMs || getRequestTimeoutMs();
  }
}

/**
 * Default exports for the base module.
 */
