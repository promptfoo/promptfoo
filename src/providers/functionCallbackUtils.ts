import logger from '../logger';
import {
  CallbackPathTraversalError,
  loadCallbackFromFileUrl,
  wrapError,
} from '../util/functions/loadFunction';
import { executeCallback } from './functionCallbackExecutor';
import { getMcpErrorMessage, isMcpErrorResult, normalizeMcpToolContent } from './mcp/util';

import type {
  FunctionCall,
  FunctionCallback,
  FunctionCallbackConfig,
  FunctionCallResult,
  ToolCall,
} from './functionCallbackTypes';
import type { MCPClient } from './mcp/client';

/**
 * Resolve a `file://` callback reference through the shared path-traversal guard,
 * preserving the underlying error on `cause` so callers can classify it.
 */
export async function loadProviderCallbackFromFileUrl(
  fileRef: string,
  logPrefix?: string,
): Promise<Function> {
  try {
    return await loadCallbackFromFileUrl(fileRef, logPrefix ? { logPrefix } : undefined);
  } catch (error) {
    if (error instanceof CallbackPathTraversalError) {
      throw error;
    }
    throw wrapError(`Error loading function from ${fileRef}: ${(error as Error).message}`, error);
  }
}

/**
 * Run a direct provider callback with strict file exports and string output.
 * Google retains raw values; FunctionCallbackHandler allows fallback file exports.
 */
export async function executeProviderFunctionCallback({
  functionName,
  args,
  callId,
  callbacks,
  cache,
  logPrefix,
  signal,
}: {
  functionName: string;
  args: string;
  callId?: string;
  callbacks: Record<string, any> | undefined;
  /** Per-provider-instance memo of resolved callbacks. Mutated in place. */
  cache: Record<string, Function>;
  /** This provider's log prefix, e.g. `[Bedrock Converse]`. */
  logPrefix?: string;
  signal?: AbortSignal;
}): Promise<string> {
  signal?.throwIfAborted();
  const prefix = logPrefix ? `${logPrefix} ` : '';
  try {
    logger.debug(`${prefix}Executing function '${functionName}' with args: ${args}`);
    const execution = await executeCallback({
      name: functionName,
      args,
      callId,
      reference:
        callbacks && Object.prototype.hasOwnProperty.call(callbacks, functionName)
          ? callbacks[functionName]
          : undefined,
      cache,
      signal,
      loadFile: (reference) => loadProviderCallbackFromFileUrl(reference, logPrefix),
      transformOutput: (result) => {
        if (result === undefined || result === null) {
          return '';
        }
        if (typeof result === 'object') {
          try {
            return JSON.stringify(result);
          } catch (error) {
            logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
            return String(result);
          }
        }
        return String(result);
      },
    });
    if (execution.isError) {
      throw execution.error;
    }
    return execution.output as string;
  } catch (error: any) {
    logger.error(
      `${prefix}Error executing function '${functionName}': ${error.message || String(error)}`,
    );
    // Re-thrown so the caller can apply its own fallback behavior.
    throw error;
  }
}

/**
 * Handles function callback execution for AI providers.
 * Provides a unified way to execute function callbacks across different provider formats.
 */
export class FunctionCallbackHandler {
  private loadedCallbacks: Record<string, FunctionCallback> = {};
  private mcpToolNames: Set<string> | null = null;

  constructor(private mcpClient?: MCPClient) {}

  /**
   * Processes a function call by executing its callback or returning the original call
   * @param call The function call to process (can be various formats)
   * @param callbacks Configuration mapping function names to callbacks
   * @param context Optional context to pass to the callback
   * @returns The result of processing
   */
  async processCall(
    call: FunctionCall | ToolCall | any,
    callbacks?: FunctionCallbackConfig,
    context?: any,
    options?: { abortSignal?: AbortSignal },
  ): Promise<FunctionCallResult> {
    options?.abortSignal?.throwIfAborted();
    // Extract function information from various formats
    const functionInfo = this.extractFunctionInfo(call);

    // Check if this is an MCP tool first (before checking function callbacks)
    if (this.mcpClient && functionInfo) {
      // Lazy-load MCP tool names for efficient lookup
      if (this.mcpToolNames === null) {
        const mcpTools = this.mcpClient.getAllTools();
        this.mcpToolNames = new Set(mcpTools.map((tool) => tool.name));
      }

      if (this.mcpToolNames.has(functionInfo.name)) {
        return await this.executeMcpTool(
          functionInfo.name,
          functionInfo.arguments,
          options?.abortSignal,
        );
      }
    }

    if (
      !functionInfo ||
      !callbacks ||
      !Object.prototype.hasOwnProperty.call(callbacks, functionInfo.name) ||
      !callbacks[functionInfo.name]
    ) {
      // No callback available - return stringified original
      return {
        output: typeof call === 'string' ? call : JSON.stringify(call),
        isError: false,
      };
    }

    try {
      // Execute the callback
      const result = await this.executeCallback(
        functionInfo.name,
        functionInfo.arguments || '{}',
        callbacks,
        context,
        typeof call?.call_id === 'string'
          ? call.call_id
          : typeof call?.id === 'string'
            ? call.id
            : undefined,
        options?.abortSignal,
      );
      return {
        output: result,
        isError: false,
      };
    } catch (error) {
      options?.abortSignal?.throwIfAborted();
      // Surface security-class failures at `warn` so a rejected path-traversal
      // attempt isn't indistinguishable from "no callback registered". The
      // generic loader/runtime errors stay at debug to avoid log noise from
      // expected user mistakes (missing file, syntax error in callback, etc.).
      // Reach for `.cause` via a cast: it exists at runtime on Node 18+ but
      // isn't on the ES2020 Error type that some downstream tsconfigs use.
      const cause = (error as Error & { cause?: unknown })?.cause;
      const isTraversal =
        error instanceof CallbackPathTraversalError || cause instanceof CallbackPathTraversalError;
      if (isTraversal) {
        logger.warn(
          `[FunctionCallback] Rejected callback '${functionInfo.name}': ${(error as Error).message}`,
        );
      } else {
        logger.debug(`Function callback failed for ${functionInfo.name}: ${error}`);
      }
      // Return original call on error
      return {
        output: typeof call === 'string' ? call : JSON.stringify(call),
        isError: true,
      };
    }
  }

  /**
   * Processes multiple function calls
   * @param calls Array of calls or a single call
   * @param callbacks Configuration mapping function names to callbacks
   * @param context Optional context to pass to callbacks
   * @param options Processing options
   * @returns Processed output in appropriate format
   */
  async processCalls(
    calls: any,
    callbacks?: FunctionCallbackConfig,
    context?: any,
    options?: { returnRawOnError?: boolean; abortSignal?: AbortSignal },
  ): Promise<any> {
    if (!calls) {
      return calls;
    }

    const isArray = Array.isArray(calls);
    const callsArray = isArray ? calls : [calls];

    const settled = await Promise.allSettled(
      callsArray.map((call) => this.processCall(call, callbacks, context, options)),
    );
    const results = settled.map((result, index) =>
      result.status === 'fulfilled'
        ? result.value
        : { output: JSON.stringify(callsArray[index]), isError: true },
    );
    const rejected = settled.find((result) => result.status === 'rejected');

    // If any callback succeeded, return processed results
    const hasSuccess = results.some(
      (r, index) => !r.isError && r.output !== JSON.stringify(callsArray[index]),
    );
    if (rejected && !hasSuccess) {
      throw rejected.reason;
    }

    if (hasSuccess) {
      const outputs = results.map((r) => r.output);
      // For single call with successful callback, return just the output
      if (!isArray && outputs.length === 1) {
        return outputs[0];
      }
      // For multiple calls, join string results
      return outputs.every((o) => typeof o === 'string') ? outputs.join('\n') : outputs;
    }

    // All failed or no callbacks - return stringified results
    if (!isArray && results.length === 1) {
      return results[0].output;
    }

    // For arrays, return the original array
    return calls;
  }

  /**
   * Extracts function name and arguments from various call formats
   */
  private extractFunctionInfo(call: any): FunctionCall | null {
    if (!call || typeof call !== 'object') {
      return null;
    }

    // Direct function call format
    if (call.name && typeof call.name === 'string') {
      return {
        name: call.name,
        arguments: call.arguments,
      };
    }

    // Tool call format
    if (call.type === 'function' && call.function?.name) {
      return {
        name: call.function.name,
        arguments: call.function.arguments,
      };
    }

    return null;
  }

  /**
   * Executes a function callback
   */
  private async executeCallback(
    functionName: string,
    args: string,
    callbacks: FunctionCallbackConfig,
    context?: any,
    callId?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const execution = await executeCallback({
      name: functionName,
      args,
      callId,
      reference: callbacks[functionName],
      cache: this.loadedCallbacks,
      signal,
      context,
      passContext: true,
      transformOutput: (output) =>
        typeof output === 'string' ? output : (JSON.stringify(output) ?? ''),
      loadFile: (reference) => this.loadExternalFunction(reference),
    });
    if (execution.isError) {
      throw execution.error;
    }
    return execution.output as string;
  }

  /**
   * Loads a function from an external file.
   *
   * Uses `lenient: true` so a missing named export silently falls back to the
   * module's default export, preserving long-standing behavior. The six
   * provider-specific loaders use strict mode and throw on missing named
   * exports — see {@link loadCallbackFromFileUrl}.
   */
  private async loadExternalFunction(fileRef: string): Promise<FunctionCallback> {
    try {
      return (await loadCallbackFromFileUrl(fileRef, { lenient: true })) as FunctionCallback;
    } catch (error) {
      throw wrapError(
        `Failed to load function from ${fileRef}: ${(error as Error).message}`,
        error,
      );
    }
  }

  /**
   * Executes an MCP tool
   */
  private async executeMcpTool(
    toolName: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<FunctionCallResult> {
    try {
      if (!this.mcpClient) {
        throw new Error('MCP client not available');
      }

      // Parse arguments: support stringified JSON, object, or empty
      const parsedArgs =
        args == null || args === '' ? {} : typeof args === 'string' ? JSON.parse(args) : args;
      signal?.throwIfAborted();
      const result = await this.mcpClient.callTool(toolName, parsedArgs, signal);

      if (isMcpErrorResult(result)) {
        return {
          output: `MCP Tool Error (${toolName}): ${getMcpErrorMessage(result)}`,
          isError: true,
        };
      }

      const content = normalizeMcpToolContent(result?.content);
      return { output: `MCP Tool Result (${toolName}): ${content}`, isError: false };
    } catch (error) {
      signal?.throwIfAborted();
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`MCP tool execution failed for ${toolName}: ${errorMessage}`);
      return {
        output: `MCP Tool Error (${toolName}): ${errorMessage}`,
        isError: true,
      };
    }
  }

  /**
   * Sets the MCP client, preserving any loaded callbacks
   */
  setMcpClient(client?: MCPClient): void {
    this.mcpClient = client;
    // Reset cached tool names when MCP client changes
    this.mcpToolNames = null;
  }

  /**
   * Clears the cached callbacks
   */
  clearCache(): void {
    this.loadedCallbacks = {};
  }
}
