import type { TextContent, ToolResponse, ToolResult } from './types';

/**
 * Default timeout for long-running operations (5 minutes)
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Creates a standardized tool response with proper typing
 */
export function createToolResponse<T = unknown>(
  tool: string,
  success: boolean,
  data?: T,
  error?: string,
): ToolResult {
  const response: ToolResponse<T> = {
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

  const content: TextContent = {
    type: 'text',
    text: JSON.stringify(response, null, 2),
  };

  return {
    content: [content],
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
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Truncate text to specified length with ellipsis.
 * The returned string is guaranteed to be at most maxLength characters.
 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return text.slice(0, maxLength - 3) + '...';
}
