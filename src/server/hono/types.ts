import type { Context, TypedResponse } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Type helper for Hono route handlers with typed params
 *
 * @example
 * const handler: HonoHandler<'/users/:id'> = (c) => {
 *   const id = c.req.param('id'); // typed as string
 *   return c.json({ id });
 * };
 */
export type HonoHandler<P extends string = string> = (
  c: Context<{ Variables: Record<string, unknown> }, P>,
) => Response | Promise<Response>;

/**
 * Type helper for Hono route handlers with typed response
 *
 * @example
 * const handler: TypedHonoHandler<'/users/:id', { id: string; name: string }> = (c) => {
 *   return c.json({ id: '1', name: 'John' });
 * };
 */
export type TypedHonoHandler<P extends string, TResponse> = (
  c: Context<{ Variables: Record<string, unknown> }, P>,
) => TypedResponse<TResponse> | Promise<TypedResponse<TResponse>>;

// =============================================================================
// Response Types
// =============================================================================

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T> {
  data: T;
  error?: never;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  error: string;
  data?: never;
  details?: Record<string, unknown>;
}

/**
 * Combined API response type - either success or error
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Legacy response shape (for backward compatibility)
 * @deprecated Use ApiSuccessResponse or ApiErrorResponse instead
 */
export interface LegacyApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Create an error JSON response
 *
 * @example
 * return errorResponse(c, 'Not found', 404);
 * return errorResponse(c, 'Validation failed', 400, { field: 'email' });
 */
export function errorResponse(
  c: Context,
  message: string,
  status: ContentfulStatusCode = 400,
  details?: Record<string, unknown>,
): Response {
  const body: ApiErrorResponse = details ? { error: message, details } : { error: message };
  return c.json(body, status);
}

/**
 * Create a success JSON response with data wrapper
 *
 * @example
 * return successResponse(c, { id: '123', name: 'Test' });
 */
export function successResponse<T>(c: Context, data: T): Response {
  return c.json({ data } satisfies ApiSuccessResponse<T>);
}

/**
 * Create a JSON response without wrapper (raw data)
 *
 * @example
 * return jsonResponse(c, { version: '1.0.0' });
 * return jsonResponse(c, users, 201);
 */
export function jsonResponse<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
  return c.json(data, status);
}

/**
 * Create a 201 Created response
 */
export function createdResponse<T>(c: Context, data: T): Response {
  return c.json({ data } satisfies ApiSuccessResponse<T>, 201);
}

/**
 * Create a 204 No Content response
 */
export function noContentResponse(c: Context): Response {
  return c.body(null, 204);
}

/**
 * Create a 404 Not Found response
 */
export function notFoundResponse(c: Context, message = 'Not found'): Response {
  return errorResponse(c, message, 404);
}

/**
 * Create a 500 Internal Server Error response
 */
export function serverErrorResponse(c: Context, message = 'Internal server error'): Response {
  return errorResponse(c, message, 500);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a response is a success response
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return 'data' in response && !('error' in response && response.error);
}

/**
 * Type guard to check if a response is an error response
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return 'error' in response && typeof response.error === 'string';
}
