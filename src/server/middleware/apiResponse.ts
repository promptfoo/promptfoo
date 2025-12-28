/**
 * Standardized API Response Utilities
 *
 * Provides consistent response formats across all API endpoints.
 *
 * ## Error Responses
 *
 * All error responses should use sendError() which returns:
 * `{ success: false, error: string, details?: string }`
 *
 * This format is being adopted incrementally across all routes.
 * See HttpStatus for standard status codes.
 *
 * ## Success Responses
 *
 * Success responses have two options:
 *
 * 1. **Raw data** (existing pattern): `res.json({ traces, total })`
 *    - Most existing endpoints use this pattern
 *    - Simpler, but no explicit success indicator
 *
 * 2. **Wrapped data** (new pattern): `sendSuccess(res, { traces, total })`
 *    - Returns: `{ success: true, data: { traces, total } }`
 *    - Explicit success indicator
 *    - Use for NEW endpoints or when migrating
 *
 * ## Migration Strategy
 *
 * - New endpoints SHOULD use sendError() for errors
 * - New endpoints MAY use sendSuccess() for wrapped responses
 * - Existing endpoints should migrate to sendError() when modified
 * - Full migration to sendSuccess() is optional and should be coordinated
 *
 * Usage:
 *   import { sendError, sendSuccess, HttpStatus } from '../middleware';
 *
 *   // Error responses (required for consistency)
 *   sendError(res, HttpStatus.BAD_REQUEST, 'Invalid input');
 *   sendError(res, HttpStatus.NOT_FOUND, 'Not found', 'Resource does not exist');
 *
 *   // Success responses (optional wrapper)
 *   sendSuccess(res, { items: [...] });
 *   sendSuccess(res, { id: '123' }, HttpStatus.CREATED);
 */

import type { Response } from 'express';

/**
 * Standard error response shape.
 * Matches ApiErrorResponseSchema from common.ts
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: string;
}

/**
 * Standard success response shape with data wrapper.
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Sends a standardized error response.
 *
 * @param res - Express response object
 * @param statusCode - HTTP status code (400, 404, 500, etc.)
 * @param error - Error message
 * @param details - Optional additional details
 */
export function sendError(
  res: Response,
  statusCode: number,
  error: string,
  details?: string,
): void {
  const response: ApiErrorResponse = {
    success: false,
    error,
  };
  if (details !== undefined) {
    response.details = details;
  }
  res.status(statusCode).json(response);
}

/**
 * Sends a standardized success response with data wrapper.
 *
 * @param res - Express response object
 * @param data - Response data
 * @param statusCode - HTTP status code (default: 200)
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };
  res.status(statusCode).json(response);
}

/**
 * HTTP status codes for common scenarios.
 * Use these instead of magic numbers.
 */
export const HttpStatus = {
  // Success
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,

  // Client errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,

  // Server errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Common error messages for consistency.
 */
export const ErrorMessages = {
  NOT_FOUND: 'Resource not found',
  INVALID_INPUT: 'Invalid input',
  VALIDATION_FAILED: 'Validation failed',
  INTERNAL_ERROR: 'An unexpected error occurred',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
} as const;

/**
 * Extracts error message from unknown error type.
 * Safely handles Error objects, strings, and unknown types.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Handles route errors consistently.
 * Use in catch blocks to standardize error responses and logging.
 *
 * @param res - Express response object
 * @param error - The caught error (unknown type)
 * @param context - Context string for logging (e.g., 'fetching configs')
 * @param logger - Logger instance with error method
 *
 * @example
 * ```typescript
 * router.get('/', async (req, res) => {
 *   try {
 *     // ... route logic
 *   } catch (error) {
 *     handleRouteError(res, error, 'fetching configs', logger);
 *   }
 * });
 * ```
 */
export function handleRouteError(
  res: Response,
  error: unknown,
  context: string,
  logger: { error: (msg: string) => void },
): void {
  const message = getErrorMessage(error);
  logger.error(`Error ${context}: ${message}`);
  sendError(res, HttpStatus.INTERNAL_SERVER_ERROR, `Failed ${context}`);
}

/**
 * Type-safe query parameter extractor.
 * Extracts a string query parameter with proper typing.
 *
 * @example
 * ```typescript
 * const type = getQueryString(req, 'type'); // string | undefined
 * const limit = getQueryNumber(req, 'limit', 10); // number (defaults to 10)
 * ```
 */
export function getQueryString(
  req: { query: Record<string, unknown> },
  key: string,
): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Type-safe numeric query parameter extractor.
 * Returns the parsed number or a default value.
 */
export function getQueryNumber(
  req: { query: Record<string, unknown> },
  key: string,
  defaultValue: number,
): number {
  const value = req.query[key];
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Type-safe boolean query parameter extractor.
 * Treats 'true', '1', 'yes' as true.
 */
export function getQueryBoolean(
  req: { query: Record<string, unknown> },
  key: string,
  defaultValue = false,
): boolean {
  const value = req.query[key];
  if (typeof value === 'string') {
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  }
  return defaultValue;
}

/**
 * Type-safe route parameter extractor.
 */
export function getParam(req: { params: Record<string, string> }, key: string): string {
  return req.params[key] ?? '';
}
