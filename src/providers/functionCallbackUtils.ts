import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isJavascriptFile } from '../util/fileExtensions';

import type {
  FunctionCall,
  FunctionCallback,
  FunctionCallbackConfig,
  FunctionCallResult,
  ToolCall,
} from './functionCallbackTypes';

/**
 * Handles function callback execution for AI providers.
 * Provides a unified way to execute function callbacks across different provider formats.
 */
export class FunctionCallbackHandler {
  private loadedCallbacks: Record<string, FunctionCallback> = {};

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
    // Extract function information from various formats
    const functionInfo = this.extractFunctionInfo(call);
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
    if (!calls) {
      return calls;
    }

    const isArray = Array.isArray(calls);
    const callsArray = isArray ? calls : [calls];

    const results = await Promise.all(
      callsArray.map((call) => this.processCall(call, callbacks, context)),
    );

    // If any callback succeeded, return processed results
    const hasSuccess = results.some(
      (r, index) => !r.isError && r.output !== JSON.stringify(callsArray[index]),
    );

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
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    // Parse file:function format
    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

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
   * Clears the cached callbacks
   */
  clearCache(): void {
    this.loadedCallbacks = {};
  }
}
