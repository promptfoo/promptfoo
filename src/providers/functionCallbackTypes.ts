/**
 * Type definitions for function callbacks across providers
 */

/**
 * Base structure for a function call
 */
export interface FunctionCall {
  name: string;
  arguments?: string;
}

/**
 * OpenAI/Azure tool call structure
 */
export interface ToolCall {
  id?: string;
  type: 'function';
  function: FunctionCall;
}

/**
 * Function callback that processes arguments and returns a result
 */
export type FunctionCallback = (args: string, context?: any) => string | Promise<string>;

/**
 * Configuration for function callbacks
 */
export type FunctionCallbackConfig = Record<string, FunctionCallback | string>;

/**
 * Result of processing function calls
 */
export interface FunctionCallResult {
  output: string | any;
  isError: boolean;
}
