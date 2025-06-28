import type { ToolResponse } from './types';

/**
 * Creates a standardized tool response
 */
export function createToolResponse(
  tool: string,
  success: boolean,
  data?: any,
  error?: string,
): any {
  const response: ToolResponse = {
    tool,
    success,
    timestamp: new Date().toISOString(),
  };

  if (success && data !== undefined) {
    response.data = data;
  }

  if (!success && error) {
    response.error = error;
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    isError: !success,
  };
}

/**
 * Creates a promise that rejects after the specified timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}
