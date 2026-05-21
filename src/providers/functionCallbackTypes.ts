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
/**
 * Result of processing a single function/tool call. Modeled as a union so
 * `isMcpError` (set only when an MCP tool — not a regular callback — failed)
 * cannot be combined with `isError: false`.
 */
export type FunctionCallResult =
  | { output: string | any; isError: false }
  | { output: string | any; isError: true; isMcpError?: boolean };
