/**
 * Typed API client utilities.
 *
 * Provides type-safe API calls with optional runtime validation using shared DTOs.
 *
 * Usage:
 *   import { callApiTyped, callApiValidated, ApiRequestError } from '@app/utils/apiClient';
 *   import { GetUserEmailResponseSchema, type GetUserEmailResponse } from '@promptfoo/dtos';
 *
 *   // Type-safe (compile-time only, no runtime validation)
 *   const data = await callApiTyped<GetUserEmailResponse>('/user/email');
 *
 *   // Validated (runtime validation with Zod schema)
 *   const data = await callApiValidated('/user/email', GetUserEmailResponseSchema);
 *
 *   // Type-safe error handling
 *   try {
 *     await callApiTyped('/some/endpoint');
 *   } catch (error) {
 *     if (error instanceof ApiRequestError) {
 *       console.log(error.errorMessage);  // Type-safe error message
 *       console.log(error.errorDetails);  // Optional details
 *       if (error.isNotFound) { ... }
 *       if (error.isBadRequest) { ... }
 *     }
 *   }
 */

import type { ZodSchema, ZodError } from 'zod';
import { ApiErrorResponseSchema, type ApiErrorResponse } from '@promptfoo/dtos';
import { callApi } from './api';

/**
 * Error thrown when API response validation fails.
 */
export class ApiValidationError extends Error {
  constructor(
    public readonly route: string,
    public readonly zodError: ZodError,
  ) {
    const issues = zodError.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    super(`API validation failed for ${route}: ${issues}`);
    this.name = 'ApiValidationError';
  }
}

/**
 * Error thrown when API request fails.
 */
export class ApiRequestError extends Error {
  private _responseData: unknown;
  private _responseDataParsed = false;
  private _errorBody: ApiErrorResponse | null = null;
  private _errorBodyParsed = false;

  constructor(
    public readonly route: string,
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: string,
  ) {
    super(`API request failed for ${route}: ${status} ${statusText}`);
    this.name = 'ApiRequestError';
  }

  /**
   * Lazily parsed response body as JSON.
   * Returns undefined if body is not valid JSON.
   */
  get responseData(): unknown {
    if (!this._responseDataParsed) {
      this._responseDataParsed = true;
      if (this.body) {
        try {
          this._responseData = JSON.parse(this.body);
        } catch {
          this._responseData = undefined;
        }
      }
    }
    return this._responseData;
  }

  /**
   * Type-safe parsed error body matching ApiErrorResponseSchema.
   * Returns null if body doesn't match the schema.
   */
  get errorBody(): ApiErrorResponse | null {
    if (!this._errorBodyParsed) {
      this._errorBodyParsed = true;
      const result = ApiErrorResponseSchema.safeParse(this.responseData);
      this._errorBody = result.success ? result.data : null;
    }
    return this._errorBody;
  }

  /**
   * Extracts the error message from the response body.
   * Falls back to statusText if body doesn't contain a valid error message.
   */
  get errorMessage(): string {
    return this.errorBody?.error ?? this.statusText;
  }

  /**
   * Extracts additional error details from the response body.
   * Returns undefined if not available.
   */
  get errorDetails(): unknown {
    return this.errorBody?.details;
  }

  /**
   * Whether this is a client error (4xx status).
   */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /**
   * Whether this is a server error (5xx status).
   */
  get isServerError(): boolean {
    return this.status >= 500;
  }

  /**
   * Whether this is a "not found" error (404).
   */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * Whether this is an "unauthorized" error (401).
   */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /**
   * Whether this is a "forbidden" error (403).
   */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Whether this is a "bad request" error (400).
   */
  get isBadRequest(): boolean {
    return this.status === 400;
  }
}

/**
 * Options for API calls.
 */
export interface ApiCallOptions extends Omit<RequestInit, 'body'> {
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Throw on non-2xx status (default: true) */
  throwOnError?: boolean;
}

/**
 * Calls an API endpoint and returns typed data (compile-time only).
 *
 * This provides TypeScript type safety but does NOT validate the response at runtime.
 * Use `callApiValidated` if you need runtime validation.
 *
 * @example
 * const data = await callApiTyped<GetUserEmailResponse>('/user/email');
 */
export async function callApiTyped<T>(
  path: string,
  options: ApiCallOptions = {},
): Promise<T> {
  const { body, throwOnError = true, ...fetchOptions } = options;

  const requestInit: RequestInit = {
    ...fetchOptions,
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
    requestInit.headers = {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    };
  }

  const response = await callApi(path, requestInit);

  if (!response.ok && throwOnError) {
    const errorBody = await response.text().catch(() => undefined);
    throw new ApiRequestError(path, response.status, response.statusText, errorBody);
  }

  return response.json() as Promise<T>;
}

/**
 * Calls an API endpoint and validates the response with a Zod schema.
 *
 * This provides both TypeScript type safety AND runtime validation.
 * Throws `ApiValidationError` if the response doesn't match the schema.
 *
 * @example
 * import { GetUserEmailResponseSchema } from '@promptfoo/dtos';
 * const data = await callApiValidated('/user/email', GetUserEmailResponseSchema);
 */
export async function callApiValidated<T>(
  path: string,
  schema: ZodSchema<T>,
  options: ApiCallOptions = {},
): Promise<T> {
  const data = await callApiTyped<unknown>(path, options);

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiValidationError(path, result.error);
  }

  return result.data;
}

/**
 * Safely calls an API endpoint and validates the response.
 *
 * Returns a result object instead of throwing on errors.
 *
 * @example
 * const result = await callApiSafe('/user/email', GetUserEmailResponseSchema);
 * if (result.success) {
 *   console.log(result.data.email);
 * } else {
 *   console.error(result.error);
 * }
 */
export async function callApiSafe<T>(
  path: string,
  schema: ZodSchema<T>,
  options: ApiCallOptions = {},
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
  try {
    const data = await callApiValidated(path, schema, options);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
}
