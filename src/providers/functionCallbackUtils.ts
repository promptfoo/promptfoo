import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import logger from '../logger';
import { isJavascriptFile } from '../util/fileExtensions';

/**
 * Shared function callback handler for providers that support function tools.
 * This class provides common functionality for loading and executing function callbacks
 * across different providers (OpenAI, Google, Azure, etc.).
 */
export class FunctionCallbackHandler {
  private loadedCallbacks: Record<string, Function> = {};

  /**
   * Loads an external function from a file reference (file://path:functionName)
   * @param fileRef File reference in format file://path or file://path:functionName
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

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
      const result = functionName && mod[functionName] ? mod[functionName] : mod.default || mod;

      if (typeof result !== 'function') {
        throw new Error(
          `Expected ${resolvedPath}${functionName ? `:${functionName}` : ''} to export a function, got ${typeof result}`,
        );
      }

      return result;
    } catch (error) {
      const errorMessage = `Failed to load function from ${filePath}${functionName ? `:${functionName}` : ''}: ${error}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Processes a function call item, executing callback if available or returning fallback
   * @param item The function call item (with name and arguments)
   * @param callbacks The callbacks configuration object
   * @param context Optional context to pass to the callback
   * @returns The result of the function execution or stringified original item
   */
  async processFunctionCall(
    item: { name?: string; arguments?: string; [key: string]: any },
    callbacks?: Record<string, string | Function>,
    context?: any,
  ): Promise<{ result: string; success: boolean }> {
    if (!item.name) {
      return { result: JSON.stringify(item), success: false };
    }

    // Check if callback exists
    if (!callbacks || !callbacks[item.name]) {
      return { result: JSON.stringify(item), success: false };
    }

    try {
      const result = await this.executeCallback(
        item.name,
        item.arguments || '{}',
        callbacks,
        context,
      );
      return { result, success: true };
    } catch (error) {
      logger.debug(
        `Function callback failed for ${item.name} with error ${error}, falling back to original output`,
      );
      return { result: JSON.stringify(item), success: false };
    }
  }

  /**
   * Executes a function callback with proper error handling
   * @param functionName The name of the function to execute
   * @param args The arguments to pass to the function (as JSON string)
   * @param callbacks The callbacks configuration object
   * @param context Optional context to pass to the callback
   * @returns The result of the function execution as a string
   */
  async executeCallback(
    functionName: string,
    args: string,
    callbacks?: Record<string, string | Function>,
    context?: any,
  ): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback && callbacks) {
        const callbackRef = callbacks[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute callback - it should already be a function at this point
      // If context is provided, pass it as the second argument
      const result = context ? await callback(args, context) : await callback(args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error: any) {
      logger.error(`Error executing function callback ${functionName}: ${error}`);
      // Re-throw the error so providers can handle fallback behavior
      throw error;
    }
  }

  /**
   * Processes multiple function calls and returns combined results
   * @param items Array of function call items or single item
   * @param callbacks The callbacks configuration object
   * @param context Optional context to pass to callbacks
   * @returns Combined results and whether any callback succeeded
   */
  async processMultipleFunctionCalls(
    items: any | any[],
    callbacks?: Record<string, string | Function>,
  ): Promise<{ output: any; hasSuccessfulCallback: boolean }> {
    if (!items) {
      return { output: '', hasSuccessfulCallback: false };
    }

    const results: string[] = [];
    let hasSuccessfulCallback = false;

    // Normalize to array
    const itemsArray = Array.isArray(items) ? items : [items];

    for (const item of itemsArray) {
      if (item.type === 'function' && item.function) {
        // Handle nested function structure (e.g., tool_calls)
        const { result, success } = await this.processFunctionCall(
          item.function,
          callbacks,
        );
        results.push(result);
        if (success) {
          hasSuccessfulCallback = true;
        }
      } else if (item.name) {
        // Handle flat function structure (e.g., function_call)
        const { result, success } = await this.processFunctionCall(
          item,
          callbacks,
        );
        results.push(result);
        if (success) {
          hasSuccessfulCallback = true;
        }
      } else {
        // Unknown structure, stringify it
        results.push(JSON.stringify(item));
      }
    }

    // Return appropriate output based on success
    if (hasSuccessfulCallback && results.length > 0) {
      return { 
        output: results.length === 1 ? results[0] : results.join('\n'), 
        hasSuccessfulCallback: true 
      };
    }
    
    // If no callbacks succeeded, return original items
    // For single items, parse the stringified result back to object
    if (!Array.isArray(items) && results.length === 1) {
      try {
        return { 
          output: JSON.parse(results[0]), 
          hasSuccessfulCallback: false 
        };
      } catch {
        return { 
          output: results[0], 
          hasSuccessfulCallback: false 
        };
      }
    }
    
    return { 
      output: Array.isArray(items) ? items : items, 
      hasSuccessfulCallback: false 
    };
  }

  /**
   * Clears the cached callbacks
   */
  clearCache(): void {
    this.loadedCallbacks = {};
  }
}