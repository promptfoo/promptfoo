import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { parseFileUrl } from '../util/functions/loadFunction';
import { getMcpErrorMessage, isMcpErrorResult } from './mcp/util';

import type {
  FunctionCall,
  FunctionCallback,
  FunctionCallbackConfig,
  FunctionCallResult,
  ToolCall,
} from './functionCallbackTypes';
import type { MCPClient } from './mcp/client';

interface McpToolCallOutcome {
  error?: string;
  name: string;
  status: 'error' | 'success';
}

interface DetailedFunctionCallResult extends FunctionCallResult {
  mcpToolCall?: McpToolCallOutcome;
}

interface DetailedFunctionCallsResult {
  mcpToolCalls: McpToolCallOutcome[];
  output: any;
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
  ): Promise<FunctionCallResult> {
    const { mcpToolCall: _mcpToolCall, ...result } = await this.processCallDetailed(
      call,
      callbacks,
      context,
    );
    return result;
  }

  private async processCallDetailed(
    call: FunctionCall | ToolCall | any,
    callbacks?: FunctionCallbackConfig,
    context?: any,
  ): Promise<DetailedFunctionCallResult> {
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
        return await this.executeMcpTool(functionInfo.name, functionInfo.arguments);
      }
    }

    if (!functionInfo || !callbacks || !callbacks[functionInfo.name]) {
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
      );
      return {
        output: result,
        isError: false,
      };
    } catch (error) {
      logger.debug(`Function callback failed for ${functionInfo.name}: ${error}`);
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
    options?: { returnRawOnError?: boolean },
  ): Promise<any> {
    return (await this.processCallsDetailed(calls, callbacks, context, options)).output;
  }

  /**
   * Processes calls while preserving invocation-local MCP outcomes for provider metadata.
   */
  async processCallsDetailed(
    calls: any,
    callbacks?: FunctionCallbackConfig,
    context?: any,
    _options?: { returnRawOnError?: boolean },
  ): Promise<DetailedFunctionCallsResult> {
    if (!calls) {
      return { output: calls, mcpToolCalls: [] };
    }

    const isArray = Array.isArray(calls);
    const callsArray = isArray ? calls : [calls];

    const results = await Promise.all(
      callsArray.map((call) => this.processCallDetailed(call, callbacks, context)),
    );

    // If any callback succeeded, return processed results
    const hasSuccess = results.some(
      (r, index) => !r.isError && r.output !== JSON.stringify(callsArray[index]),
    );

    let output: any;
    if (hasSuccess) {
      const outputs = results.map((r) => r.output);
      // For single call with successful callback, return just the output
      if (!isArray && outputs.length === 1) {
        output = outputs[0];
      } else {
        // For multiple calls, join string results
        output = outputs.every((value) => typeof value === 'string') ? outputs.join('\n') : outputs;
      }
    } else if (!isArray && results.length === 1) {
      // All failed or no callbacks - return the single stringified result.
      output = results[0].output;
    } else {
      // For arrays, return the original array.
      output = calls;
    }

    return {
      output,
      mcpToolCalls: results.flatMap((result) => (result.mcpToolCall ? [result.mcpToolCall] : [])),
    };
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
  ): Promise<string> {
    // Get or load the callback
    let callback = this.loadedCallbacks[functionName];

    if (!callback) {
      const callbackConfig = callbacks[functionName];

      if (typeof callbackConfig === 'string') {
        // String callback - either file reference or inline code
        if (callbackConfig.startsWith('file://')) {
          callback = await this.loadExternalFunction(callbackConfig);
        } else {
          // Inline function string
          callback = new Function('return ' + callbackConfig)() as FunctionCallback;
        }
      } else if (typeof callbackConfig === 'function') {
        callback = callbackConfig;
      } else {
        throw new Error(`Invalid callback configuration for ${functionName}`);
      }

      // Cache for future use
      this.loadedCallbacks[functionName] = callback;
    }

    // Execute the callback
    const result = await callback(args, context);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  /**
   * Loads a function from an external file
   */
  private async loadExternalFunction(fileRef: string): Promise<FunctionCallback> {
    const { filePath, functionName } = parseFileUrl(fileRef);

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const mod = await importModule(resolvedPath);
      const func = functionName && mod[functionName] ? mod[functionName] : mod.default || mod;

      if (typeof func !== 'function') {
        throw new Error(
          `Expected ${resolvedPath}${functionName ? `:${functionName}` : ''} to export a function, got ${typeof func}`,
        );
      }

      return func as FunctionCallback;
    } catch (error) {
      throw new Error(`Failed to load function from ${fileRef}: ${error}`);
    }
  }

  /**
   * Executes an MCP tool
   */
  private async executeMcpTool(
    toolName: string,
    args: unknown,
  ): Promise<DetailedFunctionCallResult> {
    try {
      if (!this.mcpClient) {
        throw new Error('MCP client not available');
      }

      // Parse arguments: support stringified JSON, object, or empty
      const parsedArgs =
        args == null || args === '' ? {} : typeof args === 'string' ? JSON.parse(args) : args;
      const result = await this.mcpClient.callTool(toolName, parsedArgs);

      if (isMcpErrorResult(result)) {
        const error = getMcpErrorMessage(result);
        return {
          output: `MCP Tool Error (${toolName}): ${error}`,
          isError: true,
          mcpToolCall: { name: toolName, status: 'error', error },
        };
      }

      // Normalize MCP content to a readable string to avoid "[object Object]"
      const normalizeContent = (content: any): string => {
        if (content == null) {
          return '';
        }
        if (typeof content === 'string') {
          return content;
        }
        if (Array.isArray(content)) {
          return content
            .map((part) => {
              if (typeof part === 'string') {
                return part;
              }
              if (part && typeof part === 'object') {
                if ('text' in part && (part as any).text != null) {
                  return String((part as any).text);
                }
                if ('json' in part) {
                  return JSON.stringify((part as any).json);
                }
                if ('data' in part) {
                  return JSON.stringify((part as any).data);
                }
                return JSON.stringify(part);
              }
              return String(part);
            })
            .join('\n');
        }
        return JSON.stringify(content);
      };

      const content = normalizeContent(result?.content);
      return {
        output: `MCP Tool Result (${toolName}): ${content}`,
        isError: false,
        mcpToolCall: { name: toolName, status: 'success' },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.debug(`MCP tool execution failed for ${toolName}: ${errorMessage}`);
      return {
        output: `MCP Tool Error (${toolName}): ${errorMessage}`,
        isError: true,
        mcpToolCall: { name: toolName, status: 'error', error: errorMessage },
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
