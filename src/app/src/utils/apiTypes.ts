/**
 * API response types for type-safe API calls
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export type DeleteEvalErrorCode =
  | 'NOT_FOUND'
  | 'CONSTRAINT_VIOLATION'
  | 'DATABASE_BUSY'
  | 'INTERNAL_ERROR';

export interface DeleteEvalResponse {
  success: boolean;
  message?: string;
  error?: string;
  code?: DeleteEvalErrorCode;
}

/**
 * Custom error class for API errors with structured information
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    // Maintain proper stack trace for where error was thrown (only in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Type-safe wrapper for callApi that parses and validates responses
 */
export async function callApiTyped<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const { callApi } = await import('./api');
  const response = await callApi(path, options);
  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', data.code, response.status);
  }

  return data;
}
